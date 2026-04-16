import { useState, useRef, useCallback } from "react";
import { Paperclip, Link2, X, Loader2, Lock, Unlock, FileText, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { NeedAttachment } from "@/types/need-description";

interface NeedInputProps {
  contextText: string;
  attachments: NeedAttachment[];
  status: "not_started" | "editing" | "locked";
  error: string | null;
  canLock: boolean;
  sessionId: string | null;
  onContextTextChange: (text: string) => void;
  onAddAttachment: (attachment: NeedAttachment) => void;
  onRemoveAttachment: (index: number) => void;
  onError: (error: string | null) => void;
  onLock: () => void;
  onUnlock: () => void;
}

const NeedInput = ({
  contextText,
  attachments,
  status,
  error,
  canLock,
  sessionId,
  onContextTextChange,
  onAddAttachment,
  onRemoveAttachment,
  onError,
  onLock,
  onUnlock,
}: NeedInputProps) => {
  const [uploading, setUploading] = useState(false);
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
    if (!file || !sessionId) return;

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
      const storagePath = `${sessionId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("need-attachments")
        .upload(storagePath, file, { upsert: true });

      if (uploadError) {
        throw new Error(uploadError.message || "Failed to upload file.");
      }

      onAddAttachment({
        type: "file",
        reference: file.name,
        storage_path: storagePath,
      });
    } catch (err: unknown) {
      onError((err as Error).message || "Failed to upload file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUrlSubmit = () => {
    const url = urlValue.trim();
    if (!url) return;

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      onError("Invalid URL format. Please provide a valid http or https URL.");
      return;
    }

    onError(null);
    onAddAttachment({ type: "url", reference: url });
    setShowUrlInput(false);
    setUrlValue("");
  };

  return (
    <div className="space-y-4">
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={contextText}
        onChange={(e) => {
          onContextTextChange(e.target.value);
          autoResize();
        }}
        readOnly={isLocked}
        placeholder={
          isLocked && !contextText.trim() && attachments.length > 0
            ? "No context text provided — attachments will be analyzed in the next step."
            : "Describe what you're looking for, or add context to your attachments below..."
        }
        className={cn(
          "w-full min-h-[150px] rounded-card border px-4 py-3 text-body text-foreground placeholder:text-foreground-muted outline-none resize-none transition-colors",
          isLocked
            ? "bg-elevated/60 border-border cursor-default"
            : "bg-surface border-border focus:border-border-accent focus:ring-1 focus:ring-ring"
        )}
      />

      {/* Attachment badges */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((att, i) => (
            <Badge
              key={`${att.type}-${att.reference}-${i}`}
              variant="default"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs"
            >
              {att.type === "file" ? (
                <FileText className="w-3 h-3 shrink-0" />
              ) : (
                <Globe className="w-3 h-3 shrink-0" />
              )}
              <span className="truncate max-w-[260px]">{att.reference}</span>
              {!isLocked && (
                <button
                  onClick={() => onRemoveAttachment(i)}
                  className="ml-1 hover:text-destructive transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

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
              <span>{uploading ? "Uploading..." : "Attach file"}</span>
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
                  disabled={!urlValue.trim()}
                  className="h-7 text-xs px-3"
                >
                  Add
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
            disabled={!canLock}
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
