import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractText } from "npm:unpdf@0.12.1";

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
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);

      if (uint8.byteLength > 15 * 1024 * 1024) {
        return new Response(
          JSON.stringify({ error: "PDF too large. Maximum size is 15MB." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await extractText(uint8, { mergePages: true });
      text = result.text || "";

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
 * Extract text from DOCX (which is a ZIP of XML files).
 * Reads word/document.xml and strips XML tags.
 */
async function extractTextFromDocx(data: Uint8Array): Promise<string> {
  const zipEntries = parseZipEntries(data);
  const docEntry = zipEntries.find(
    (e) => e.filename === "word/document.xml"
  );

  if (!docEntry) {
    throw new Error("Invalid DOCX file: word/document.xml not found");
  }

  let xmlContent: string;
  if (docEntry.compressionMethod === 0) {
    xmlContent = new TextDecoder().decode(docEntry.data);
  } else {
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
    if (sig !== 0x04034b50) break;

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
