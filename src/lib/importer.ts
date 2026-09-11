import JSZip from 'jszip';
import type { CasePackage } from '../types';

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickEntry(files: Record<string, string>): string {
  const names = Object.keys(files);
  return (
    names.find((n) => n.toLowerCase().endsWith('index.html')) ||
    names.find((n) => n.toLowerCase().endsWith('.html')) ||
    names[0]
  );
}

function isTextFile(name: string): boolean {
  return /\.(html?|css|svg|txt|json)$/i.test(name);
}

/** 读取用户选择的文件（夹）为文本键值表 */
export async function readFiles(fileList: FileList | File[]): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const items = Array.from(fileList);

  // FileSystemFileEntry 递归（webkitdirectory 目录选择）
  const entries = items
    .map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath)
    .some(Boolean);

  for (const file of items) {
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const key = entries ? rel.replace(/^[^/]+\//, '') : rel;
    if (!isTextFile(key)) continue;
    files[key] = await file.text();
  }
  return files;
}

export async function importFromFiles(files: FileList | File[]): Promise<CasePackage> {
  // ZIP 单文件
  const arr = Array.from(files);
  if (arr.length === 1 && /\.zip$/i.test(arr[0].name)) {
    return importFromZip(arr[0]);
  }

  const map = await readFiles(files);
  // 若包含 audit-case.json 清单则读取元信息
  let name = arr[0]?.name?.replace(/\.[^.]+$/, '') || '导入的案例';
  let description = '用户导入的 HTML/CSS 案例包';
  if (map['audit-case.json']) {
    try {
      const meta = JSON.parse(map['audit-case.json']);
      if (meta.name) name = meta.name;
      if (meta.description) description = meta.description;
    } catch {
      /* 清单损坏则忽略 */
    }
    delete map['audit-case.json'];
  }

  const entry = pickEntry(map);
  if (!entry || !/\.html?$/i.test(entry)) {
    throw new Error('案例包中未找到 HTML 入口文件');
  }

  return {
    id: uid('case'),
    kind: 'imported',
    name,
    description,
    entry,
    files: map,
    importedAt: Date.now(),
    origin: 'import'
  };
}

export async function importFromZip(zipFile: File): Promise<CasePackage> {
  const zip = await JSZip.loadAsync(zipFile);
  const files: Record<string, string> = {};
  let name = zipFile.name.replace(/\.zip$/i, '');
  let description = '用户导入的 HTML/CSS 案例包（ZIP）';

  const zipPaths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
  // 去掉公共顶层目录
  const topFolders = new Set(zipPaths.map((p) => p.split('/')[0]));
  const stripPrefix = topFolders.size === 1 && zipPaths[0].includes('/') ? zipPaths[0].split('/')[0] + '/' : '';

  for (const path of zipPaths) {
    const key = stripPrefix ? path.slice(stripPrefix.length) : path;
    if (key === 'audit-case.json') {
      const text = await zip.files[path].async('string');
      try {
        const meta = JSON.parse(text);
        if (meta.name) name = meta.name;
        if (meta.description) description = meta.description;
      } catch {
        /* ignore */
      }
      continue;
    }
    if (!isTextFile(key)) continue;
    files[key] = await zip.files[path].async('string');
  }

  const entry = pickEntry(files);
  if (!entry || !/\.html?$/i.test(entry)) {
    throw new Error('ZIP 中未找到 HTML 入口文件');
  }

  return {
    id: uid('case'),
    kind: 'imported',
    name,
    description,
    entry,
    files,
    importedAt: Date.now(),
    origin: 'import'
  };
}
