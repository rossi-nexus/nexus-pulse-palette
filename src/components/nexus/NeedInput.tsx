import { useState, useRef, useCallback } from "react";
import { Paperclip, Link2, X, Loader2, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface NeedInputProps {
  text: string;
  sourceType: "freeform" | "file" | "url";
  sourceReference?: string;
  status: "not_started" | "editing" | "locked";
  error: string | null;
  onTextChange: (text: string) => void;
  onSourceChange: (type: "freeform" | "file" | "url", ref?: string) => void;
  onError: (error: string | null) => void;
  onLock: () => void;
  onUnlock: () => void;
}

const NeedInput = ({
  text,
  sourceType,
  sourceReference,
  status,
  error,
  onTextChange,
  onSourceChange,
  onError,
  onLock,
  onUnlock,
}: NeedInputProps) => {
  const [uploading, setUploading] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLocked = status === "locked";

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.max(150, ta.scrollHeight) + "px";
    }
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    const validExtensions = [".pdf", ".docx", ".txt"];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));

    if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
      onError("Unsupported file type. Please upload PDF, Word (.docx), or plain text (.txt).");
      return;
    }

    setUploading(true);
    onError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const { data, error: fnError } = await supabase.functions.invoke("extract-file-text", {
        body: formData,
      });

      if (fnError || data?.error) {
        throw new Error(data?.error || fnError?.message || "File extraction failed");
      }

      onTextChange(data.text);
      onSourceChange("file", data.filename || file.name);
      setTimeout(autoResize, 0);
    } catch (err: unknown) {
      onError((err as Error).message || "Failed to extract text from file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUrlSubmit = async () => {
    if (!urlValue.trim()) return;

    setFetchingUrl(true);
    onError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("extract-url-text", {
        body: { url: urlValue.trim() },
      });

      if (fnError || data?.error) {
        throw new Error(data?.error || fnError?.message || "URL extraction failed");
      }

      onTextChange(data.text);
      onSourceChange("url", urlValue.trim());
      setShowUrlInput(false);
      setUrlValue("");
      setTimeout(autoResize, 0);
    } catch (err: unknown) {
      onError((err as Error).message || "Failed to extract content from URL.");
    } finally {
      setFetchingUrl(false);
    }
  };

  const clearSource = () => {
    onSourceChange("freeform", undefined);
  };

  return (
    <div className="space-y-4">
      {/* Source badge */}
      {sourceReference && (
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-elevated border border-border text-caption text-foreground-secondary">
            {sourceType === "file" ? (
              <Paperclip className="w-3 h-3 text-foreground-muted" />
            ) : (
              <Link2 className="w-3 h-3 text-foreground-muted" />
            )}
            <span className="truncate max-w-[300px]">{sourceReference}</span>
            {!isLocked && (
              <button onClick={clearSource} className="text-foreground-muted hover:text-foreground transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          onTextChange(e.target.value);
          if (sourceType !== "freeform" && !sourceReference) {
            onSourceChange("freeform");
          }
          autoResize();
        }}
        readOnly={isLocked}
        placeholder="Describe what you're looking for..."
        className={cn(
          "w-full min-h-[150px] rounded-card border px-4 py-3 text-body text-foreground placeholder:text-foreground-muted outline-none resize-none transition-colors",
          isLocked
            ? "bg-elevated/60 border-border cursor-default"
            : "bg-surface border-border focus:border-border-accent focus:ring-1 focus:ring-ring"
        )}
      />

      {/* Error message */}
      {error && (
        <div className="px-3 py-2 rounded border border-destructive/50 bg-destructive/10 text-caption text-destructive">
          {error}
        </div>
      )}

      {/* Action bar */}
      {!isLocked && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Attach file */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-caption text-foreground-muted hover:text-foreground-secondary transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Paperclip className="w-3.5 h-3.5" />
              )}
              <span>{uploading ? "Extracting..." : "Attach file"}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Paste URL */}
            {!showUrlInput ? (
              <button
                onClick={() => setShowUrlInput(true)}
                className="flex items-center gap-1.5 text-caption text-foreground-muted hover:text-foreground-secondary transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Paste URL</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  placeholder="https://..."
                  className="h-7 px-2 rounded border border-border bg-surface text-caption text-foreground placeholder:text-foreground-muted outline-none focus:border-border-accent w-[240px]"
                  onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
                  autoFocus
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleUrlSubmit}
                  disabled={fetchingUrl || !urlValue.trim()}
                  className="h-7 text-xs px-3"
                >
                  {fetchingUrl ? <Loader2 className="w-3 h-3 animate-spin" /> : "Fetch"}
                </Button>
                <button
                  onClick={() => { setShowUrlInput(false); setUrlValue(""); }}
                  className="text-foreground-muted hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Lock button */}
          <Button
            onClick={onLock}
            disabled={!text.trim()}
            className="gap-2"
          >
            <Lock className="w-3.5 h-3.5" />
            Analyze need
          </Button>
        </div>
      )}

      {/* Locked state controls */}
      {isLocked && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={onUnlock} className="gap-2 text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive">
            <Unlock className="w-3.5 h-3.5" />
            Unlock
          </Button>
        </div>
      )}
    </div>
  );
};

export default NeedInput;
