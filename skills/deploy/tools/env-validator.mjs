#!/usr/bin/env node
// tools/env-validator.mjs
// Validates required environment variables using an explicit project manifest
// when available, with the legacy .env.example heuristic as a fallback.
// Usage: node tools/env-validator.mjs <project-directory>

import { readFileSync, existsSync } from 'fs';
import { basename, isAbsolute, join, relative, resolve } from 'path';

const MANIFEST_NAME = '.env-validator.json';
const VARIABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NON_BLOCKING_CLASSIFICATIONS = [
  'ui_managed',
  'optional',
  'defaulted',
  'machine_local',
  'deprecated',
];

function output(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function parseEnvFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)/);
    if (match) {
      const key = match[1];
      let value = match[3].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      vars[key] = value;
    }
  }
  return vars;
}

function safeProjectPath(projectRoot, configuredPath) {
  if (typeof configuredPath !== 'string' || !configuredPath.trim() || isAbsolute(configuredPath)) {
    throw new Error(`Manifest env file path must be a non-empty relative path: ${String(configuredPath)}`);
  }
  const resolvedPath = resolve(projectRoot, configuredPath);
  const relativePath = relative(projectRoot, resolvedPath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Manifest env file path escapes project directory: ${configuredPath}`);
  }
  return resolvedPath;
}

function normalizeRequirement(rawRequirement, targetName) {
  const requirement = typeof rawRequirement === 'string'
    ? { variable: rawRequirement }
    : rawRequirement;
  if (!requirement || typeof requirement !== 'object' || !VARIABLE_NAME_RE.test(requirement.variable ?? '')) {
    throw new Error(`Invalid required variable in target ${targetName}`);
  }
  if (requirement.min_length !== undefined && (!Number.isInteger(requirement.min_length) || requirement.min_length < 1)) {
    throw new Error(`Invalid min_length for ${requirement.variable} in target ${targetName}`);
  }
  if (requirement.equals !== undefined && typeof requirement.equals !== 'string') {
    throw new Error(`Invalid equals value for ${requirement.variable} in target ${targetName}`);
  }
  if (requirement.forbidden_values !== undefined && (
    !Array.isArray(requirement.forbidden_values) ||
    requirement.forbidden_values.some((value) => typeof value !== 'string')
  )) {
    throw new Error(`Invalid forbidden_values for ${requirement.variable} in target ${targetName}`);
  }
  if (requirement.forbidden_prefixes !== undefined && (
    !Array.isArray(requirement.forbidden_prefixes) ||
    requirement.forbidden_prefixes.some((value) => typeof value !== 'string' || value.length === 0)
  )) {
    throw new Error(`Invalid forbidden_prefixes for ${requirement.variable} in target ${targetName}`);
  }
  return requirement;
}

function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object' || manifest.version !== 1) {
    throw new Error('Manifest version must be 1');
  }
  if (!Array.isArray(manifest.targets) || manifest.targets.length === 0) {
    throw new Error('Manifest must define at least one target');
  }
  const targetNames = new Set();
  for (const target of manifest.targets) {
    if (!target || typeof target !== 'object' || typeof target.name !== 'string' || !target.name.trim()) {
      throw new Error('Every manifest target must have a non-empty name');
    }
    if (targetNames.has(target.name)) {
      throw new Error(`Duplicate manifest target name: ${target.name}`);
    }
    targetNames.add(target.name);
    if (!Array.isArray(target.env_files) || target.env_files.length === 0 || target.env_files.some((path) => typeof path !== 'string')) {
      throw new Error(`Target ${target.name} must define env_files`);
    }
    if (!Array.isArray(target.required) || target.required.length === 0) {
      throw new Error(`Target ${target.name} must define required variables`);
    }
    if (target.checks !== undefined && !Array.isArray(target.checks)) {
      throw new Error(`Target ${target.name} checks must be an array`);
    }
    if (target.include_process_env !== undefined && typeof target.include_process_env !== 'boolean') {
      throw new Error(`Target ${target.name} include_process_env must be a boolean`);
    }
    target.required.map((requirement) => normalizeRequirement(requirement, target.name));
    (target.checks ?? []).map((requirement) => normalizeRequirement(requirement, target.name));
  }
  if (manifest.classifications !== undefined) {
    if (!manifest.classifications || typeof manifest.classifications !== 'object' || Array.isArray(manifest.classifications)) {
      throw new Error('Manifest classifications must be an object');
    }
    for (const classification of NON_BLOCKING_CLASSIFICATIONS) {
      const variables = manifest.classifications[classification];
      if (variables !== undefined && (
        !Array.isArray(variables) ||
        variables.some((variable) => typeof variable !== 'string' || !VARIABLE_NAME_RE.test(variable))
      )) {
        throw new Error(`Manifest classification ${classification} must contain variable names`);
      }
    }
  }
}

function validateConfiguredValue(targetName, requirement, actualValue, required) {
  const variable = requirement.variable;
  if (actualValue === undefined) {
    if (!required) return null;
    return {
      target: targetName,
      variable,
      status: 'missing',
      severity: 'critical',
      message: `${variable} is required for ${targetName} but is not set`,
    };
  }
  if (actualValue === '') {
    if (!required) return null;
    return {
      target: targetName,
      variable,
      status: 'empty',
      severity: 'critical',
      message: `${variable} is required for ${targetName} but is empty`,
    };
  }
  if (isPlaceholder(actualValue)) {
    return {
      target: targetName,
      variable,
      status: 'placeholder',
      severity: 'critical',
      message: `${variable} for ${targetName} still has a placeholder value`,
    };
  }
  if (requirement.min_length !== undefined && actualValue.length < requirement.min_length) {
    return {
      target: targetName,
      variable,
      status: 'too_short',
      severity: 'critical',
      message: `${variable} for ${targetName} must be at least ${requirement.min_length} characters`,
    };
  }
  if (requirement.equals !== undefined && actualValue.toLowerCase() !== requirement.equals.toLowerCase()) {
    return {
      target: targetName,
      variable,
      status: 'unexpected_value',
      severity: 'critical',
      message: `${variable} for ${targetName} must equal the required production value`,
    };
  }
  const forbiddenValues = (requirement.forbidden_values ?? []).map((value) => value.toLowerCase());
  if (forbiddenValues.includes(actualValue.toLowerCase())) {
    return {
      target: targetName,
      variable,
      status: 'forbidden_value',
      severity: 'critical',
      message: `${variable} for ${targetName} has a forbidden production value`,
    };
  }
  const forbiddenPrefix = (requirement.forbidden_prefixes ?? [])
    .find((prefix) => actualValue.toLowerCase().startsWith(prefix.toLowerCase()));
  if (forbiddenPrefix) {
    return {
      target: targetName,
      variable,
      status: 'forbidden_prefix',
      severity: 'critical',
      message: `${variable} for ${targetName} uses a forbidden production credential class`,
    };
  }
  return null;
}

function validateWithManifest(dir, manifestPath) {
  const projectRoot = resolve(dir);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  validateManifestShape(manifest);

  const findings = [];
  const targets = [];
  let totalRequired = 0;
  let setCount = 0;
  let totalChecks = 0;
  let configuredChecks = 0;

  for (const target of manifest.targets) {
    const actualVars = {};
    const loadedFiles = [];
    const missingFiles = [];
    for (const configuredPath of target.env_files) {
      const envPath = safeProjectPath(projectRoot, configuredPath);
      if (!existsSync(envPath)) {
        missingFiles.push(configuredPath);
        continue;
      }
      Object.assign(actualVars, parseEnvFile(envPath));
      loadedFiles.push(configuredPath);
    }

    if (loadedFiles.length === 0) {
      findings.push({
        target: target.name,
        variable: target.env_files.join(', '),
        status: 'env_file_missing',
        severity: 'critical',
        message: `No environment file is available for ${target.name}`,
      });
    }

    const targetFindings = [];
    const requirements = target.required.map((requirement) => normalizeRequirement(requirement, target.name));
    totalRequired += requirements.length;
    for (const requirement of requirements) {
      const variable = requirement.variable;
      const actualValue = target.include_process_env === true && process.env[variable] !== undefined
        ? process.env[variable]
        : actualVars[variable];
      const finding = validateConfiguredValue(target.name, requirement, actualValue, true);
      if (finding) {
        findings.push(finding);
        targetFindings.push(finding);
      } else {
        setCount += 1;
      }
    }
    const checks = (target.checks ?? []).map((requirement) => normalizeRequirement(requirement, target.name));
    totalChecks += checks.length;
    for (const check of checks) {
      const variable = check.variable;
      const actualValue = target.include_process_env === true && process.env[variable] !== undefined
        ? process.env[variable]
        : actualVars[variable];
      if (actualValue !== undefined && actualValue !== '') configuredChecks += 1;
      const finding = validateConfiguredValue(target.name, check, actualValue, false);
      if (finding) {
        findings.push(finding);
        targetFindings.push(finding);
      }
    }
    targets.push({
      name: target.name,
      loaded_env_files: loadedFiles,
      missing_env_files: missingFiles,
      total_required: requirements.length,
      total_optional_checks: checks.length,
      valid: loadedFiles.length > 0 && targetFindings.length === 0,
    });
  }

  const classifications = {};
  for (const classification of NON_BLOCKING_CLASSIFICATIONS) {
    classifications[classification] = Array.from(new Set(manifest.classifications?.[classification] ?? []));
  }

  const missing = findings.filter((finding) => finding.status === 'missing' || finding.status === 'env_file_missing').length;
  const empty = findings.filter((finding) => finding.status === 'empty').length;
  const placeholder = findings.filter((finding) => finding.status === 'placeholder').length;
  const invalid = findings.length - missing - empty - placeholder;

  return {
    success: true,
    validation_mode: 'manifest',
    manifest_file: basename(manifestPath),
    total_required: totalRequired,
    set: setCount,
    total_optional_checks: totalChecks,
    configured_optional_checks: configuredChecks,
    missing,
    empty,
    placeholder,
    invalid,
    deploy_ready: findings.length === 0,
    targets,
    classifications,
    findings,
  };
}

function validateWithExampleHeuristic(dir) {
  const exampleNames = ['.env.example', '.env.sample', '.env.template', '.env.defaults'];
  let exampleFile = null;
  for (const name of exampleNames) {
    const path = join(dir, name);
    if (existsSync(path)) {
      exampleFile = path;
      break;
    }
  }

  if (!exampleFile) {
    return {
      success: true,
      validation_mode: 'heuristic',
      warning: 'No .env.example file found. Cannot validate required environment variables.',
      suggestion: `Create ${MANIFEST_NAME} to declare required environment variables and their service sources.`,
      findings: [],
    };
  }

  const requiredVars = parseEnvFile(exampleFile);
  const requiredKeys = Object.keys(requiredVars);
  if (requiredKeys.length === 0) {
    return { success: true, validation_mode: 'heuristic', message: 'No variables found in example file.', findings: [] };
  }

  const envFile = join(dir, '.env');
  const envLocalFile = join(dir, '.env.local');
  let actualVars = {};
  if (existsSync(envLocalFile)) actualVars = { ...actualVars, ...parseEnvFile(envLocalFile) };
  if (existsSync(envFile)) actualVars = { ...actualVars, ...parseEnvFile(envFile) };
  for (const key of requiredKeys) {
    if (process.env[key] !== undefined) actualVars[key] = process.env[key];
  }

  const findings = [];
  const missing = [];
  const empty = [];
  const placeholder = [];
  const set = [];
  for (const key of requiredKeys) {
    const exampleValue = requiredVars[key];
    const actualValue = actualVars[key];
    if (actualValue === undefined) {
      missing.push(key);
      findings.push({
        variable: key,
        status: 'missing',
        severity: 'critical',
        message: `${key} is required but not set in .env or environment`,
        example_value: exampleValue || '(no example provided)',
      });
    } else if (actualValue === '') {
      empty.push(key);
      findings.push({ variable: key, status: 'empty', severity: 'high', message: `${key} is set but empty` });
    } else if (actualValue === exampleValue && isPlaceholder(exampleValue)) {
      placeholder.push(key);
      findings.push({
        variable: key,
        status: 'placeholder',
        severity: 'high',
        message: `${key} still has its placeholder value — update it with the real value`,
      });
    } else {
      set.push(key);
    }
  }

  return {
    success: true,
    validation_mode: 'heuristic',
    warning: `${MANIFEST_NAME} is not present; every example variable is treated as required.`,
    example_file: basename(exampleFile),
    total_required: requiredKeys.length,
    set: set.length,
    missing: missing.length,
    empty: empty.length,
    placeholder: placeholder.length,
    deploy_ready: missing.length === 0 && empty.length === 0 && placeholder.length === 0,
    findings,
  };
}

function checkEnvGitignore(dir, result) {
  const gitignorePath = join(dir, '.gitignore');
  const envInGitignore = existsSync(gitignorePath) && readFileSync(gitignorePath, 'utf8')
    .split('\n')
    .some((line) => ['.env', '.env*', '.env.local'].includes(line.trim()));
  if (!envInGitignore) {
    result.findings ??= [];
    result.findings.push({
      variable: '.env',
      status: 'gitignore_missing',
      severity: 'critical',
      message: '.env is not in .gitignore — secrets may be committed',
    });
    result.deploy_ready = false;
  }
  result.env_in_gitignore = envInGitignore;
  return result;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    output({ error: 'Usage: node env-validator.mjs <project-directory>', success: false });
    return;
  }

  try {
    const manifestPath = join(dir, MANIFEST_NAME);
    const result = existsSync(manifestPath)
      ? validateWithManifest(dir, manifestPath)
      : validateWithExampleHeuristic(dir);
    output(checkEnvGitignore(dir, result));
  } catch (error) {
    output({
      success: false,
      validation_mode: 'manifest',
      manifest_file: MANIFEST_NAME,
      deploy_ready: false,
      error: error instanceof Error ? error.message : String(error),
      findings: [],
    });
  }
}

function isPlaceholder(value) {
  if (!value) return false;
  const v = value.toLowerCase();
  return (
    v.includes('your_') || v.includes('xxx') || v.includes('placeholder') ||
    v.includes('change_me') || v.includes('todo') || v.includes('replace') ||
    v.includes('your-') || v === 'sk-...' || v === 'pk_...' ||
    v.match(/^[a-z_]+_here$/i) !== null
  );
}

main();
