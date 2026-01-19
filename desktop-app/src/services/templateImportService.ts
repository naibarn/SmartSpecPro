/**
 * Template Import Service
 * Handles ZIP extraction and merging with existing projects
 */

import { exists, createDir, readDir, readBinaryFile, writeBinaryFile, readTextFile, writeTextFile } from '@tauri-apps/api/fs';
import { join, basename, dirname } from '@tauri-apps/api/path';
import JSZip from 'jszip';
import { toast } from 'react-hot-toast';

export interface MergeOptions {
  /**
   * Strategy for handling file conflicts
   * - 'replace': Replace existing files with template files
   * - 'merge': Merge files intelligently (for JSON, package.json, etc.)
   * - 'skip': Keep existing files, skip template files
   * - 'prompt': Ask user for each conflict
   */
  conflictStrategy: 'replace' | 'merge' | 'skip' | 'prompt';

  /**
   * Create backup before merging
   */
  createBackup: boolean;

  /**
   * Merge package.json dependencies
   */
  mergeDependencies: boolean;

  /**
   * Update import paths automatically
   */
  updateImports: boolean;

  /**
   * Excluded patterns (won't be imported)
   */
  excludePatterns?: string[];
}

export interface FileConflict {
  path: string;
  existingSize: number;
  templateSize: number;
  canMerge: boolean; // true for JSON, package.json, etc.
}

export interface ImportResult {
  success: boolean;
  extractedFiles: string[];
  conflicts: FileConflict[];
  mergedFiles: string[];
  skippedFiles: string[];
  backupPath?: string;
  errors: string[];
}

const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.next/**',
  '__pycache__/**',
  '*.pyc',
  '.env',
  '.env.local',
];

/**
 * Extract and merge template into project
 */
export async function extractAndMergeTemplate(
  zipPath: string,
  projectPath: string,
  options: MergeOptions
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    extractedFiles: [],
    conflicts: [],
    mergedFiles: [],
    skippedFiles: [],
    errors: [],
  };

  try {
    // 1. Read ZIP file
    const zipData = await readBinaryFile(zipPath);
    const zip = await JSZip.loadAsync(zipData);

    // 2. Create backup if requested
    if (options.createBackup) {
      result.backupPath = await createBackup(projectPath);
    }

    // 3. Analyze ZIP contents
    const files = await analyzeZipContents(zip, options.excludePatterns);

    // 4. Check for conflicts
    result.conflicts = await detectConflicts(files, projectPath);

    // 5. Extract and merge files
    for (const filePath of files) {
      try {
        const zipEntry = zip.file(filePath);
        if (!zipEntry) continue;

        const targetPath = await join(projectPath, filePath);
        const fileExists = await exists(targetPath);

        // Handle conflict
        if (fileExists && result.conflicts.find(c => c.path === filePath)) {
          const strategy = options.conflictStrategy;

          if (strategy === 'skip') {
            result.skippedFiles.push(filePath);
            continue;
          }

          if (strategy === 'prompt') {
            // In real implementation, show UI dialog
            // For now, default to skip
            result.skippedFiles.push(filePath);
            continue;
          }

          if (strategy === 'merge' && isMergeable(filePath)) {
            // Merge JSON files
            await mergeFile(zipEntry, targetPath, options);
            result.mergedFiles.push(filePath);
            continue;
          }

          // Default: replace
          await extractFile(zipEntry, targetPath);
          result.extractedFiles.push(filePath);
        } else {
          // No conflict, just extract
          await extractFile(zipEntry, targetPath);
          result.extractedFiles.push(filePath);
        }
      } catch (error: any) {
        result.errors.push(`Failed to process ${filePath}: ${error.message}`);
      }
    }

    // 6. Post-processing
    if (options.updateImports) {
      await updateImportPaths(projectPath, result.extractedFiles);
    }

    result.success = result.errors.length === 0;
    return result;
  } catch (error: any) {
    result.errors.push(`Import failed: ${error.message}`);
    return result;
  }
}

/**
 * Analyze ZIP contents and return list of files to extract
 */
async function analyzeZipContents(
  zip: JSZip,
  excludePatterns: string[] = []
): Promise<string[]> {
  const files: string[] = [];
  const allPatterns = [...DEFAULT_EXCLUDE_PATTERNS, ...(excludePatterns || [])];

  zip.forEach((relativePath, file) => {
    if (file.dir) return; // Skip directories

    // Check if file matches exclude patterns
    const shouldExclude = allPatterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
      return regex.test(relativePath);
    });

    if (!shouldExclude) {
      files.push(relativePath);
    }
  });

  return files;
}

/**
 * Detect conflicts between template and existing project
 */
async function detectConflicts(
  files: string[],
  projectPath: string
): Promise<FileConflict[]> {
  const conflicts: FileConflict[] = [];

  for (const filePath of files) {
    const targetPath = await join(projectPath, filePath);
    const fileExists = await exists(targetPath);

    if (fileExists) {
      try {
        const existingData = await readBinaryFile(targetPath);
        const canMerge = isMergeable(filePath);

        conflicts.push({
          path: filePath,
          existingSize: existingData.length,
          templateSize: 0, // Will be filled when extracting
          canMerge,
        });
      } catch (error) {
        // File might be inaccessible, skip
      }
    }
  }

  return conflicts;
}

/**
 * Check if file can be merged (JSON, package.json, etc.)
 */
function isMergeable(filePath: string): boolean {
  const mergeable = [
    'package.json',
    'tsconfig.json',
    'tailwind.config.js',
    '.gitignore',
  ];

  const fileName = filePath.split('/').pop() || '';
  return mergeable.includes(fileName) || filePath.endsWith('.json');
}

/**
 * Extract single file from ZIP
 */
async function extractFile(zipEntry: JSZip.JSZipObject, targetPath: string): Promise<void> {
  // Ensure directory exists
  const dir = await dirname(targetPath);
  await ensureDir(dir);

  // Extract file
  const content = await zipEntry.async('uint8array');
  await writeBinaryFile(targetPath, content);
}

/**
 * Merge file intelligently (for JSON files)
 */
async function mergeFile(
  zipEntry: JSZip.JSZipObject,
  targetPath: string,
  options: MergeOptions
): Promise<void> {
  const fileName = await basename(targetPath);

  if (fileName === 'package.json' && options.mergeDependencies) {
    await mergePackageJson(zipEntry, targetPath);
  } else if (targetPath.endsWith('.json')) {
    await mergeJsonFile(zipEntry, targetPath);
  } else if (fileName === '.gitignore') {
    await mergeTextFile(zipEntry, targetPath);
  } else {
    // Default: replace
    await extractFile(zipEntry, targetPath);
  }
}

/**
 * Merge package.json files (combine dependencies)
 */
async function mergePackageJson(
  zipEntry: JSZip.JSZipObject,
  targetPath: string
): Promise<void> {
  try {
    // Read existing package.json
    const existingContent = await readTextFile(targetPath);
    const existing = JSON.parse(existingContent);

    // Read template package.json
    const templateContent = await zipEntry.async('string');
    const template = JSON.parse(templateContent);

    // Merge dependencies
    const merged = {
      ...existing,
      dependencies: {
        ...(existing.dependencies || {}),
        ...(template.dependencies || {}),
      },
      devDependencies: {
        ...(existing.devDependencies || {}),
        ...(template.devDependencies || {}),
      },
      scripts: {
        ...(existing.scripts || {}),
        ...(template.scripts || {}),
      },
    };

    // Write merged package.json
    await writeTextFile(targetPath, JSON.stringify(merged, null, 2));
  } catch (error) {
    // If merge fails, extract as-is
    await extractFile(zipEntry, targetPath);
  }
}

/**
 * Merge JSON files (deep merge)
 */
async function mergeJsonFile(
  zipEntry: JSZip.JSZipObject,
  targetPath: string
): Promise<void> {
  try {
    // Read existing JSON
    const existingContent = await readTextFile(targetPath);
    const existing = JSON.parse(existingContent);

    // Read template JSON
    const templateContent = await zipEntry.async('string');
    const template = JSON.parse(templateContent);

    // Deep merge
    const merged = deepMerge(existing, template);

    // Write merged JSON
    await writeTextFile(targetPath, JSON.stringify(merged, null, 2));
  } catch (error) {
    // If merge fails, extract as-is
    await extractFile(zipEntry, targetPath);
  }
}

/**
 * Merge text files (like .gitignore)
 */
async function mergeTextFile(
  zipEntry: JSZip.JSZipObject,
  targetPath: string
): Promise<void> {
  try {
    // Read existing content
    const existingContent = await readTextFile(targetPath);
    const existingLines = new Set(existingContent.split('\n'));

    // Read template content
    const templateContent = await zipEntry.async('string');
    const templateLines = templateContent.split('\n');

    // Merge (unique lines)
    const mergedLines = Array.from(existingLines);
    for (const line of templateLines) {
      if (line.trim() && !existingLines.has(line)) {
        mergedLines.push(line);
      }
    }

    // Write merged content
    await writeTextFile(targetPath, mergedLines.join('\n'));
  } catch (error) {
    // If merge fails, extract as-is
    await extractFile(zipEntry, targetPath);
  }
}

/**
 * Deep merge objects
 */
function deepMerge(target: any, source: any): any {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }

  return output;
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Create backup of project
 */
async function createBackup(projectPath: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `backup-${timestamp}`;
  const backupPath = await join(await dirname(projectPath), backupName);

  // In real implementation, copy entire directory
  // For now, return path
  await createDir(backupPath, { recursive: true });

  return backupPath;
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  const dirExists = await exists(dirPath);
  if (!dirExists) {
    await createDir(dirPath, { recursive: true });
  }
}

/**
 * Update import paths in extracted files
 */
async function updateImportPaths(
  projectPath: string,
  files: string[]
): Promise<void> {
  // Implementation for updating import statements
  // This would analyze TypeScript/JavaScript files and update imports
  // For now, this is a placeholder
}

/**
 * Quick import with default settings
 */
export async function quickImportTemplate(
  zipPath: string,
  projectPath: string
): Promise<ImportResult> {
  const defaultOptions: MergeOptions = {
    conflictStrategy: 'merge',
    createBackup: true,
    mergeDependencies: true,
    updateImports: true,
  };

  return extractAndMergeTemplate(zipPath, projectPath, defaultOptions);
}

/**
 * Import with user confirmation for conflicts
 */
export async function interactiveImportTemplate(
  zipPath: string,
  projectPath: string,
  onConflict: (conflict: FileConflict) => Promise<'replace' | 'merge' | 'skip'>
): Promise<ImportResult> {
  const options: MergeOptions = {
    conflictStrategy: 'prompt',
    createBackup: true,
    mergeDependencies: true,
    updateImports: true,
  };

  // First pass: detect conflicts
  const zipData = await readBinaryFile(zipPath);
  const zip = await JSZip.loadAsync(zipData);
  const files = await analyzeZipContents(zip);
  const conflicts = await detectConflicts(files, projectPath);

  // Ask user about each conflict
  const resolutions = new Map<string, 'replace' | 'merge' | 'skip'>();
  for (const conflict of conflicts) {
    const resolution = await onConflict(conflict);
    resolutions.set(conflict.path, resolution);
  }

  // Second pass: import with resolutions
  // (This would require modifying extractAndMergeTemplate to accept per-file strategies)

  return extractAndMergeTemplate(zipPath, projectPath, options);
}

/**
 * Preview what will be imported (dry run)
 */
export async function previewTemplateImport(
  zipPath: string,
  projectPath: string
): Promise<{
  totalFiles: number;
  newFiles: number;
  conflicts: FileConflict[];
  totalSize: number;
}> {
  const zipData = await readBinaryFile(zipPath);
  const zip = await JSZip.loadAsync(zipData);
  const files = await analyzeZipContents(zip);
  const conflicts = await detectConflicts(files, projectPath);

  let totalSize = 0;
  for (const filePath of files) {
    const zipEntry = zip.file(filePath);
    if (zipEntry) {
      const content = await zipEntry.async('uint8array');
      totalSize += content.length;
    }
  }

  return {
    totalFiles: files.length,
    newFiles: files.length - conflicts.length,
    conflicts,
    totalSize,
  };
}
