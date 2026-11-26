import { filesFromZip, type IngestFile } from "../lib/recon/ingest";

interface Entry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (success: (file: File) => void, failure?: (error: DOMException) => void) => void;
  createReader?: () => { readEntries: (success: (entries: Entry[]) => void, failure?: (error: DOMException) => void) => void };
}

export async function filesFromFileList(list: FileList | File[]): Promise<IngestFile[]> {
  const collected: IngestFile[] = [];
  for (const file of [...list]) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = file.webkitRelativePath || file.name;
    if (file.name.toLowerCase().endsWith(".zip")) collected.push(...filesFromZip(bytes));
    else collected.push({ path, data: bytes });
  }
  return collected;
}

export async function filesFromTransfer(transfer: DataTransfer): Promise<IngestFile[]> {
  const entries: Entry[] = [];
  for (const item of transfer.items) {
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) return filesFromFileList(transfer.files);
  const nested: IngestFile[] = [];
  for (const entry of entries) nested.push(...(await readEntry(entry)));
  return nested;
}

async function readEntry(entry: Entry): Promise<IngestFile[]> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file?.(resolve, reject));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = entry.fullPath.replace(/^\//, "") || file.name;
    if (file.name.toLowerCase().endsWith(".zip")) return filesFromZip(bytes);
    return [{ path, data: bytes }];
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const children: Entry[] = [];
    while (true) {
      const batch = await new Promise<Entry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) break;
      children.push(...batch);
    }
    const nested: IngestFile[] = [];
    for (const child of children) nested.push(...(await readEntry(child)));
    return nested;
  }
  return [];
}
