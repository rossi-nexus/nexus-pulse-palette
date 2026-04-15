import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const filename = file.name.toLowerCase();
    let text = "";

    if (filename.endsWith(".txt")) {
      text = await file.text();
    } else if (filename.endsWith(".pdf")) {
      // Use pdf-parse via a simple approach: read raw text from PDF
      const buffer = await file.arrayBuffer();
      text = extractTextFromPdfRaw(new Uint8Array(buffer));
      if (!text.trim()) {
        text = "[PDF text extraction returned empty content. The PDF may contain only images or scanned content.]";
      }
    } else if (filename.endsWith(".docx")) {
      const buffer = await file.arrayBuffer();
      text = await extractTextFromDocx(new Uint8Array(buffer));
    } else {
      return new Response(
        JSON.stringify({ error: "Unsupported file type. Please upload PDF, Word (.docx), or plain text (.txt)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ text: text.trim(), filename: file.name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("File extraction error:", err);
    return new Response(
      JSON.stringify({ error: `Failed to extract text: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Basic PDF text extraction — reads text objects from PDF stream.
 * For production, a full library would be better, but this handles most text-based PDFs.
 */
function extractTextFromPdfRaw(data: Uint8Array): string {
  const str = new TextDecoder("latin1").decode(data);
  const textParts: string[] = [];

  // Extract text between BT...ET blocks (PDF text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(str)) !== null) {
    const block = match[1];
    // Extract strings from Tj and TJ operators
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      textParts.push(decodePdfString(tjMatch[1]));
    }
    // TJ arrays
    const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
    let tjArrMatch;
    while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
      const arr = tjArrMatch[1];
      const strParts = /\(([^)]*)\)/g;
      let sp;
      while ((sp = strParts.exec(arr)) !== null) {
        textParts.push(decodePdfString(sp[1]));
      }
    }
  }

  // Also try to extract from stream-decoded content
  return textParts.join(" ").replace(/\s+/g, " ");
}

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

/**
 * Extract text from DOCX (which is a ZIP of XML files).
 * Reads word/document.xml and strips XML tags.
 */
async function extractTextFromDocx(data: Uint8Array): Promise<string> {
  // DOCX is a ZIP file. We need to find word/document.xml inside it.
  // Use a minimal ZIP reader approach
  const zipEntries = parseZipEntries(data);
  const docEntry = zipEntries.find(
    (e) => e.filename === "word/document.xml"
  );

  if (!docEntry) {
    throw new Error("Invalid DOCX file: word/document.xml not found");
  }

  let xmlContent: string;
  if (docEntry.compressionMethod === 0) {
    // Stored (not compressed)
    xmlContent = new TextDecoder().decode(docEntry.data);
  } else {
    // Deflated
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(docEntry.data);
    writer.close();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLength = chunks.reduce((s, c) => s + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    xmlContent = new TextDecoder().decode(result);
  }

  // Extract text from XML: get content of <w:t> tags, add newlines for <w:p>
  const paragraphs: string[] = [];
  const pRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let pMatch;
  while ((pMatch = pRegex.exec(xmlContent)) !== null) {
    const tRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let tMatch;
    const parts: string[] = [];
    while ((tMatch = tRegex.exec(pMatch[0])) !== null) {
      parts.push(tMatch[1]);
    }
    if (parts.length > 0) {
      paragraphs.push(parts.join(""));
    }
  }

  return paragraphs.join("\n");
}

interface ZipEntry {
  filename: string;
  compressionMethod: number;
  data: Uint8Array;
}

function parseZipEntries(data: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  while (offset < data.length - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break; // Not a local file header

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const filenameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);

    const filename = new TextDecoder().decode(
      data.slice(offset + 30, offset + 30 + filenameLength)
    );

    const dataStart = offset + 30 + filenameLength + extraLength;
    const fileData = data.slice(dataStart, dataStart + compressedSize);

    entries.push({ filename, compressionMethod, data: fileData });
    offset = dataStart + compressedSize;
  }

  return entries;
}
