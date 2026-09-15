type StoryboardSkillInputSchema = {
  type?: unknown;
};

function schemaTypes(schema: StoryboardSkillInputSchema): string[] {
  return Array.isArray(schema.type)
    ? schema.type.filter((type): type is string => typeof type === "string")
    : typeof schema.type === "string"
      ? [schema.type]
      : [];
}

export function isNumericStoryboardSkillInput(
  schema: StoryboardSkillInputSchema
): boolean {
  const types = schemaTypes(schema);
  return types.includes("integer") || types.includes("number");
}

export function coerceStoryboardSkillInputValue(
  schema: StoryboardSkillInputSchema,
  value: string
): unknown {
  if (!isNumericStoryboardSkillInput(schema)) return value;
  if (value.trim() === "") return undefined;

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}
