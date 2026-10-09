// What a failed check of a request or a saved file says, in Spanish: the first problem, where it is ("brief.series")
// and what is wrong with it, so an old project with a renamed field says which one instead of "faltaban datos".
export type CheckIssue = {
  code: string;
  path: readonly PropertyKey[];
  message: string;
  expected?: string;
  values?: readonly unknown[];
  minimum?: number | bigint;
  maximum?: number | bigint;
  origin?: string;
  keys?: readonly string[];
};

const KIND: Record<string, string> = {
  string: "un texto",
  number: "un número",
  int: "un número entero",
  boolean: "sí o no",
  object: "un grupo de datos",
  array: "una lista",
  date: "una fecha",
};

// zod's own messages start like this; anything else is a message the schema wrote on purpose, and is shown as is.
const STOCK = /^(Invalid|Too (big|small)|Unrecognized|Expected|Required)\b/;

export function issueText(issue: CheckIssue): string {
  const where = issue.path.length ? `«${issue.path.map(String).join(".")}»` : "el pedido";
  if (!STOCK.test(issue.message)) return issue.path.length ? `${where}: ${issue.message}` : issue.message;
  const n = (x: number | bigint | undefined) => String(x ?? "");
  switch (issue.code) {
    case "invalid_type":
      return /received undefined/.test(issue.message) ? `falta ${where}` : `${where} tendría que ser ${KIND[issue.expected ?? ""] ?? issue.expected ?? "otra cosa"}`;
    case "invalid_value":
      return issue.values?.length
        ? `${where} tiene que ser una de estas opciones: ${issue.values.map(String).join(", ")}`
        : `${where} no es un valor válido`;
    case "too_big":
      if (issue.origin === "string") return `${where} es demasiado largo (hasta ${n(issue.maximum)} caracteres)`;
      if (issue.origin === "array") return `${where} tiene demasiados elementos (hasta ${n(issue.maximum)})`;
      return `${where} es demasiado grande (hasta ${n(issue.maximum)})`;
    case "too_small":
      if (issue.origin === "string") return Number(issue.minimum) <= 1 ? `${where} está vacío` : `${where} es demasiado corto (al menos ${n(issue.minimum)} caracteres)`;
      if (issue.origin === "array") return Number(issue.minimum) <= 1 ? `${where} está vacío` : `${where} tiene muy pocos elementos (al menos ${n(issue.minimum)})`;
      return `${where} es demasiado chico (al menos ${n(issue.minimum)})`;
    case "invalid_format":
      return `${where} no tiene el formato esperado`;
    case "unrecognized_keys":
      return `${where} trae algo que no corresponde: ${(issue.keys ?? []).join(", ")}`;
    default:
      return `${where} no es válido`;
  }
}

// The first problem, and how many more there are. `lead` is what failed ("Al pedido le faltaban datos").
export function checkErrorText(error: { issues: readonly CheckIssue[] }, lead = "Al pedido le faltaban datos"): string {
  const [first, ...rest] = error.issues;
  if (!first) return `${lead}.`;
  return `${lead}: ${issueText(first)}${rest.length ? `, y ${rest.length === 1 ? "otro problema" : `otros ${rest.length} problemas`}` : ""}.`;
}
