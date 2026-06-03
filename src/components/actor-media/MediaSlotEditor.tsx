// P3: MediaSlotEditor — 4-tab input (Search / Upload / Paste URL / Clipboard)
// + react-easy-crop editor. Persists original + cropped image to Supabase
// Storage under <actor_id>/<media_type>/<uuid>.<ext> and writes an
// actor_media row when actorId is provided. When actorId is null (used in
// onboarding before actor exists), it returns the cropped data URL via
// onSave so the caller can defer persistence.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";
import { ExternalLink, Upload as UploadIcon, Link as LinkIcon, Clipboard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export type MediaSlotType = "logo" | "hero" | "product";
export type MediaInputSource = "search" | "upload" | "paste-url" | "clipboard";

export interface ActorMediaRecord {
  id?: string;
  actor_id?: string | null;
  type: MediaSlotType;
  url: string;            // cropped/displayed URL (https or data:)
  original_url?: string | null;
  crop_data?: unknown;
  source?: MediaInputSource;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actorId: string | null;        // null => deferred mode (onboarding)
  slotType: MediaSlotType;
  defaultQuery?: string;         // e.g. legal_name or product name
  /**
   * V3 batch #3 Area 2 — when slotType='product' and this is set, the new
   * actor_media row gets crop_data.linked_product_name = linkedProductName.
   * That ties the image to a specific product card in ProductCardGrid.
   */
  linkedProductName?: string;
  currentMedia?: ActorMediaRecord | null;
  onSave: (media: ActorMediaRecord) => void;
}

const ASPECT_BY_SLOT: Record<MediaSlotType, number> = {
  logo: 1,
  hero: 16 / 9,
  product: 4 / 3,
};

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];

type Tab = "search" | "upload" | "paste-url" | "clipboard";

export function MediaSlotEditor({
  open,
  onOpenChange,
  actorId,
  slotType,
  defaultQuery,
  onSave,
}: Props) {
  const [tab, setTab] = useState<Tab>("search");
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceMime, setSourceMime] = useState<string>("image/png");
  const [inputSource, setInputSource] = useState<MediaInputSource>("upload");
  const [searchQuery, setSearchQuery] = useState(defaultQuery ?? "");
  const [pasteUrl, setPasteUrl] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const clipboardZoneRef = useRef<HTMLDivElement>(null);

  const aspect = ASPECT_BY_SLOT[slotType];

  useEffect(() => {
    if (open) {
      setTab("search");
      setSourceImage(null);
      setPasteUrl("");
      setSearchQuery(defaultQuery ?? "");
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    }
  }, [open, defaultQuery]);

  const googleQuery = useMemo(() => {
    const base = searchQuery.trim() || defaultQuery || "";
    const suffix = slotType === "logo" ? " logo" : "";
    return encodeURIComponent(`${base}${suffix}`.trim());
  }, [searchQuery, defaultQuery, slotType]);

  const validateFile = (file: File): boolean => {
    if (file.size > MAX_BYTES) {
      toast.error("Image too large (max 5 MB).");
      return false;
    }
    if (!ALLOWED.includes(file.type)) {
      toast.error("Unsupported format. Use JPG, PNG, WEBP, or GIF.");
      return false;
    }
    return true;
  };

  const ingestFile = (file: File, src: MediaInputSource) => {
    if (!validateFile(file)) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSourceImage(reader.result as string);
      setSourceMime(file.type);
      setInputSource(src);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) ingestFile(f, "upload");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) ingestFile(f, "upload");
  };

  const handlePasteEvent = (e: React.ClipboardEvent, src: MediaInputSource) => {
    const items = e.clipboardData.items;
    for (const it of Array.from(items)) {
      if (it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) {
          ingestFile(f, src);
          e.preventDefault();
          return;
        }
      }
    }
    // Otherwise treat as text URL
    const text = e.clipboardData.getData("text");
    if (text && /^https?:\/\//i.test(text.trim())) {
      void loadFromUrl(text.trim(), src);
      e.preventDefault();
    }
  };

  const loadFromUrl = async (url: string, src: MediaInputSource) => {
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (blob.size > MAX_BYTES) {
        toast.error("Image too large (max 5 MB).");
        return;
      }
      if (!ALLOWED.includes(blob.type)) {
        toast.error("Unsupported format.");
        return;
      }
      const file = new File([blob], "from-url", { type: blob.type });
      ingestFile(file, src);
    } catch (e) {
      toast.error(
        `Couldn't fetch image: ${e instanceof Error ? e.message : "unknown"}. Try saving locally and uploading.`,
      );
    }
  };

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const renderCroppedToDataUrl = async (): Promise<string | null> => {
    if (!sourceImage || !croppedAreaPixels) return null;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = sourceImage;
    });
    const canvas = document.createElement("canvas");
    canvas.width = croppedAreaPixels.width;
    canvas.height = croppedAreaPixels.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(
      img,
      croppedAreaPixels.x,
      croppedAreaPixels.y,
      croppedAreaPixels.width,
      croppedAreaPixels.height,
      0,
      0,
      croppedAreaPixels.width,
      croppedAreaPixels.height,
    );
    return canvas.toDataURL(sourceMime === "image/gif" ? "image/png" : sourceMime);
  };

  const dataUrlToBlob = (dataUrl: string): Blob => {
    const [meta, b64] = dataUrl.split(",");
    const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? "image/png";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };

  const extFor = (mime: string) => {
    if (mime.includes("png")) return "png";
    if (mime.includes("webp")) return "webp";
    if (mime.includes("gif")) return "gif";
    return "jpg";
  };

  const handleSave = async () => {
    if (!sourceImage || !croppedAreaPixels) {
      toast.error("Pick an image and adjust the crop first.");
      return;
    }
    setSaving(true);
    try {
      const croppedDataUrl = await renderCroppedToDataUrl();
      if (!croppedDataUrl) throw new Error("Crop failed");

      // Deferred mode: return data URLs to caller.
      if (!actorId) {
        onSave({
          type: slotType,
          url: croppedDataUrl,
          original_url: sourceImage,
          crop_data: { croppedAreaPixels, zoom },
          source: inputSource,
        });
        onOpenChange(false);
        return;
      }

      const croppedBlob = dataUrlToBlob(croppedDataUrl);
      const originalBlob = dataUrlToBlob(sourceImage);
      const ext = extFor(croppedBlob.type);
      const baseId = crypto.randomUUID();
      const folder = `${actorId}/${slotType}`;
      const croppedPath = `${folder}/${baseId}.${ext}`;
      const originalPath = `${folder}/${baseId}.original.${extFor(originalBlob.type)}`;

      const [croppedUp, originalUp] = await Promise.all([
        supabase.storage.from("actor-media").upload(croppedPath, croppedBlob, {
          contentType: croppedBlob.type,
          upsert: false,
        }),
        supabase.storage.from("actor-media").upload(originalPath, originalBlob, {
          contentType: originalBlob.type,
          upsert: false,
        }),
      ]);
      if (croppedUp.error) throw croppedUp.error;
      if (originalUp.error) throw originalUp.error;

      const croppedUrl = supabase.storage.from("actor-media").getPublicUrl(croppedPath).data.publicUrl;
      const originalUrl = supabase.storage.from("actor-media").getPublicUrl(originalPath).data.publicUrl;

      // For logo/hero, overwrite by deleting prior rows of that type for actor.
      if (slotType === "logo" || slotType === "hero") {
        const { data: prior } = await supabase
          .from("actor_media")
          .select("id, url, original_url")
          .eq("actor_id", actorId)
          .eq("type", slotType);
        if (prior && prior.length > 0) {
          const paths = prior.flatMap((r: any) => {
            const out: string[] = [];
            const extract = (u: string | null) => {
              if (!u) return;
              const i = u.indexOf("/actor-media/");
              if (i >= 0) out.push(u.substring(i + "/actor-media/".length));
            };
            extract(r.url);
            extract(r.original_url);
            return out;
          });
          if (paths.length) await supabase.storage.from("actor-media").remove(paths);
          await supabase.from("actor_media").delete().in("id", prior.map((r: any) => r.id));
        }
      }

      const { data: inserted, error: insErr } = await supabase
        .from("actor_media")
        .insert({
          actor_id: actorId,
          type: slotType,
          url: croppedUrl,
          original_url: originalUrl,
          crop_data: { croppedAreaPixels, zoom } as any,
          source: inputSource,
          uploaded_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        })
        .select("id, type, url, original_url")
        .single();
      if (insErr) throw insErr;

      // Audit
      try {
        await supabase.rpc("fn_audit_log_event" as any, {
          p_event_type: "actor_media_updated",
          p_target_table: "actor_media",
          p_target_record_id: inserted.id,
          p_actor_id: actorId,
          p_programme_id: null,
          p_changes: { slot_type: slotType, source: inputSource } as any,
          p_reason: null,
        });
      } catch { /* audit non-fatal */ }

      onSave({
        id: inserted.id,
        actor_id: actorId,
        type: slotType,
        url: croppedUrl,
        original_url: originalUrl,
        source: inputSource,
      });
      onOpenChange(false);
      toast.success("Image saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save image.");
    } finally {
      setSaving(false);
    }
  };

  const TabButton = ({ id, icon, label }: { id: Tab; icon: React.ReactNode; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider border-b-2 transition-colors",
        tab === id
          ? "border-accent-teal text-foreground"
          : "border-transparent text-foreground-muted hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-elevated border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {slotType === "logo" && "Add logo"}
            {slotType === "hero" && "Add hero image"}
            {slotType === "product" && "Add product image"}
          </DialogTitle>
        </DialogHeader>

        {!sourceImage ? (
          <div>
            <div className="flex border-b border-border mb-4">
              <TabButton id="search" icon={<ExternalLink className="w-3 h-3" />} label="Search" />
              <TabButton id="upload" icon={<UploadIcon className="w-3 h-3" />} label="Upload" />
              <TabButton id="paste-url" icon={<LinkIcon className="w-3 h-3" />} label="Paste URL" />
              <TabButton id="clipboard" icon={<Clipboard className="w-3 h-3" />} label="Clipboard" />
            </div>

            {tab === "search" && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-foreground-muted">Search query</Label>
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Company or product name"
                    className="bg-surface border-border mt-1"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    window.open(`https://www.google.com/images?q=${googleQuery}`, "_blank", "noopener")
                  }
                  className="w-full"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Google Images
                </Button>
                <div
                  onPaste={(e) => handlePasteEvent(e, "search")}
                  className="border border-dashed border-border rounded-md p-4 text-center text-xs text-foreground-muted bg-surface"
                  tabIndex={0}
                >
                  After finding an image: right-click → "Copy image" then click here and paste (Ctrl+V), or paste the image URL below.
                </div>
                <Input
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  onPaste={(e) => handlePasteEvent(e, "search")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && pasteUrl.trim()) void loadFromUrl(pasteUrl.trim(), "search");
                  }}
                  placeholder="Or paste image URL and press Enter"
                  className="bg-surface border-border"
                />
              </div>
            )}

            {tab === "upload" && (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-border rounded-md p-8 text-center bg-surface"
              >
                <UploadIcon className="w-8 h-8 mx-auto text-foreground-muted mb-2" />
                <p className="text-sm text-foreground-secondary mb-3">Drag & drop an image here</p>
                <label className="inline-block">
                  <input
                    type="file"
                    accept={ALLOWED.join(",")}
                    onChange={handleUploadInput}
                    className="hidden"
                  />
                  <span className="inline-flex items-center justify-center px-4 py-2 text-sm bg-elevated border border-border rounded-md cursor-pointer hover:border-border-accent">
                    Choose file
                  </span>
                </label>
                <p className="text-[10px] text-foreground-muted mt-3 uppercase tracking-wider">
                  JPG / PNG / WEBP / GIF · max 5 MB
                </p>
              </div>
            )}

            {tab === "paste-url" && (
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wider text-foreground-muted">Image URL</Label>
                <Input
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && pasteUrl.trim()) void loadFromUrl(pasteUrl.trim(), "paste-url");
                  }}
                  placeholder="https://example.com/image.png"
                  className="bg-surface border-border"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => pasteUrl.trim() && loadFromUrl(pasteUrl.trim(), "paste-url")}
                  disabled={!pasteUrl.trim()}
                >
                  Load image
                </Button>
              </div>
            )}

            {tab === "clipboard" && (
              <div
                ref={clipboardZoneRef}
                tabIndex={0}
                onPaste={(e) => handlePasteEvent(e, "clipboard")}
                className="border-2 border-dashed border-border rounded-md p-8 text-center bg-surface cursor-text focus:outline-none focus:border-border-accent"
              >
                <Clipboard className="w-8 h-8 mx-auto text-foreground-muted mb-2" />
                <p className="text-sm text-foreground-secondary">
                  Click here, then press <kbd className="px-1.5 py-0.5 bg-elevated border border-border rounded text-xs">Ctrl+V</kbd> / <kbd className="px-1.5 py-0.5 bg-elevated border border-border rounded text-xs">⌘V</kbd>
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative w-full h-[320px] bg-base rounded-md overflow-hidden">
              <Cropper
                image={sourceImage}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-xs uppercase tracking-wider text-foreground-muted w-12">Zoom</Label>
              <Slider
                value={[zoom]}
                min={1}
                max={4}
                step={0.05}
                onValueChange={(v) => setZoom(v[0])}
                className="flex-1"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSourceImage(null);
                  setCrop({ x: 0, y: 0 });
                  setZoom(1);
                }}
              >
                <X className="w-4 h-4 mr-1" />
                Use different image
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!sourceImage || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
