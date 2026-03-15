// ─── DeckUploader ─────────────────────────────────────────────────────────────
// Drag-and-drop zone for PDF and PPTX deck uploads.
// Shows upload progress, validates file type and size.

import { useCallback, useRef, useState } from "react";
import { FileText, Upload, X, CheckCircle2 } from "lucide-react";

interface DeckUploaderProps {
  onUpload: (file: File) => Promise<void>;
  isUploading?: boolean;
  uploadProgress?: number; // 0–100
  uploadStageLabel?: string;
  uploadedFileName?: string | null;
  onClear?: () => void;
}

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
];

const MAX_SIZE_MB = 50;

export default function DeckUploader({
  onUpload,
  isUploading = false,
  uploadProgress = 0,
  uploadStageLabel = "Analyzing deck…",
  uploadedFileName = null,
  onClear,
}: DeckUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndUpload = useCallback(
    async (file: File) => {
      setFileError(null);

      const isValidType =
        ACCEPTED_TYPES.includes(file.type) ||
        file.name.endsWith(".pdf") ||
        file.name.endsWith(".pptx") ||
        file.name.endsWith(".ppt");

      if (!isValidType) {
        setFileError("Only PDF and PPTX files are supported.");
        return;
      }

      const sizeMb = file.size / (1024 * 1024);
      if (sizeMb > MAX_SIZE_MB) {
        setFileError(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`);
        return;
      }

      await onUpload(file);
    },
    [onUpload]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) validateAndUpload(file);
    },
    [validateAndUpload]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndUpload(file);
      // Reset input so same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    },
    [validateAndUpload]
  );

  // Success state
  if (uploadedFileName && !isUploading) {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-[#1A3D28] bg-[#0A1F12] px-5 py-4">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#1A3D28]">
          <CheckCircle2 className="size-5 text-[#C8FF00]" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#f0f0f0] font-medium truncate">{uploadedFileName}</p>
          <p className="text-xs text-[#5a5a5a] mt-0.5">Deck uploaded and ready</p>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-[#5a5a5a] hover:text-[#f0f0f0] hover:bg-[#161616] transition-colors"
            aria-label="Remove file"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        )}
      </div>
    );
  }

  // Upload progress state
  if (isUploading) {
    return (
      <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] px-5 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#161616]">
            <Upload className="size-5 text-[#C8FF00] animate-pulse" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm text-[#f0f0f0]">{uploadStageLabel}</p>
            <p className="text-xs text-[#5a5a5a] mt-0.5">
              {uploadProgress < 30
                ? "Sending your file to the server…"
                : uploadProgress < 65
                ? "Rendering slides from your deck…"
                : "Running AI critique on your content…"}
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="score-bar-track">
          <div
            className="score-bar-fill"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      </div>
    );
  }

  // Default drop zone
  return (
    <div>
      <div
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-3
          rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer
          transition-all duration-200
          ${isDragging
            ? "border-[#C8FF00] bg-[rgba(200,255,0,0.04)]"
            : "border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#0c0c0c]"}
        `}
      >
        <div
          className={`
            flex items-center justify-center w-12 h-12 rounded-xl
            transition-colors duration-200
            ${isDragging ? "bg-[rgba(200,255,0,0.12)]" : "bg-[#161616]"}
          `}
        >
          <FileText
            className={`size-6 transition-colors ${isDragging ? "text-[#C8FF00]" : "text-[#5a5a5a]"}`}
            strokeWidth={1.5}
          />
        </div>

        <div className="text-center">
          <p className="text-sm text-[#a0a0a0]">
            <span className="text-[#f0f0f0] font-medium">Drop your deck here</span>
            {" "}or{" "}
            <span className="text-[#C8FF00]">browse</span>
          </p>
          <p className="text-xs text-[#5a5a5a] mt-1">PDF or PPTX — max {MAX_SIZE_MB} MB</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.pptx,.ppt"
          onChange={onFileChange}
          className="sr-only"
        />
      </div>

      {fileError && (
        <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
          <X className="size-3" strokeWidth={2} />
          {fileError}
        </p>
      )}
    </div>
  );
}
