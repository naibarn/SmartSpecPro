type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  format?: string;
  pattern?: string;
};

type ValidationError = {
  instancePath: string;
  message: string;
};

type ValidateFunction = ((value: unknown) => boolean) & {
  errors?: ValidationError[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => deepEqual(value, right[index]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => deepEqual(left[key], right[key]));
  }
  return false;
}

function pushError(errors: ValidationError[], instancePath: string, message: string) {
  errors.push({ instancePath, message });
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return isPlainObject(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

function validateSchema(
  schema: JsonSchema,
  value: unknown,
  instancePath: string,
  errors: ValidationError[],
): void {
  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((entry) => validateSchema(entry, value, instancePath, errors));
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const matches = schema.anyOf.some((entry) => {
      const branchErrors: ValidationError[] = [];
      validateSchema(entry, value, instancePath, branchErrors);
      return branchErrors.length === 0;
    });
    if (!matches) {
      pushError(errors, instancePath, "must match at least one allowed schema");
    }
    return;
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    const matches = schema.oneOf.filter((entry) => {
      const branchErrors: ValidationError[] = [];
      validateSchema(entry, value, instancePath, branchErrors);
      return branchErrors.length === 0;
    }).length;
    if (matches !== 1) {
      pushError(errors, instancePath, "must match exactly one allowed schema");
    }
    return;
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const allowed = schema.enum.some((candidate) => deepEqual(candidate, value));
    if (!allowed) {
      pushError(errors, instancePath, "must be one of the allowed values");
      return;
    }
  }

  if ("const" in schema && !deepEqual(schema.const, value)) {
    pushError(errors, instancePath, "must equal the expected constant value");
    return;
  }

  const allowedTypes = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : [];
  if (allowedTypes.length > 0 && !allowedTypes.some((type) => matchesType(type, value))) {
    pushError(errors, instancePath, `must be ${allowedTypes.join(" or ")}`);
    return;
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      pushError(errors, instancePath, `must have length >= ${schema.minLength}`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      pushError(errors, instancePath, `must have length <= ${schema.maxLength}`);
    }
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        pushError(errors, instancePath, "must match the required pattern");
      }
    }
    if (schema.format === "url") {
      try {
        new URL(value);
      } catch {
        pushError(errors, instancePath, "must be a valid URL");
      }
    }
    return;
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      pushError(errors, instancePath, `must be >= ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      pushError(errors, instancePath, `must be <= ${schema.maximum}`);
    }
    return;
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      pushError(errors, instancePath, `must contain at least ${schema.minItems} item(s)`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      pushError(errors, instancePath, `must contain at most ${schema.maxItems} item(s)`);
    }
    const itemSchemas = schema.items;
    if (Array.isArray(itemSchemas)) {
      value.forEach((entry, index) => {
        const itemSchema = itemSchemas[index];
        if (itemSchema) {
          validateSchema(itemSchema, entry, `${instancePath}/${index}`, errors);
        }
      });
    } else if (itemSchemas) {
      value.forEach((entry, index) => validateSchema(itemSchemas, entry, `${instancePath}/${index}`, errors));
    }
    return;
  }

  if (isPlainObject(value)) {
    const requiredKeys = Array.isArray(schema.required) ? schema.required : [];
    for (const key of requiredKeys) {
      if (!(key in value)) {
        pushError(errors, instancePath, `must include required property "${key}"`);
      }
    }

    const properties = schema.properties ?? {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value) {
        validateSchema(propertySchema, value[key], `${instancePath}/${key}`, errors);
      }
    }

    const additionalProperties = schema.additionalProperties;
    if (additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          pushError(errors, `${instancePath}/${key}`, "is not allowed");
        }
      }
    } else if (isPlainObject(additionalProperties)) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          validateSchema(additionalProperties, value[key], `${instancePath}/${key}`, errors);
        }
      }
    }
  }
}

export default class Ajv {
  constructor(_options?: { allErrors?: boolean }) {}

  compile(schema: Record<string, unknown>): ValidateFunction {
    const normalizedSchema = schema as JsonSchema;
    const validate = ((value: unknown) => {
      const errors: ValidationError[] = [];
      validateSchema(normalizedSchema, value, "", errors);
      validate.errors = errors;
      return errors.length === 0;
    }) as ValidateFunction;
    validate.errors = [];
    return validate;
  }

  errorsText(errors?: ValidationError[]): string {
    const list = errors ?? [];
    if (list.length === 0) {
      return "No validation errors";
    }
    return list
      .map((error) => `${error.instancePath || "/"} ${error.message}`.trim())
      .join("; ");
  }
}
