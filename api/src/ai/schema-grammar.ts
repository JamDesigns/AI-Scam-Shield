/** Compile our trusted internal schema subset to an explicit llama.cpp grammar.
 * Gemma's response_format path may admit a thought channel despite thinking=false.
 * This path starts at a JSON object. Application/Zod validation remains mandatory
 * for numeric bounds, string lengths, cross-field coherence and all other rules.
 * Optional known properties are always emitted: a valid, deterministic subset.
 */
export function schemaGrammar(schema: Record<string, unknown>): string {
  const rules: string[] = [];
  let next = 0;
  const token = (text: string) => JSON.stringify(text);
  const literal = (value: unknown) => token(JSON.stringify(value)) + " space";
  function compile(node: Record<string, any>, depth = 0): string {
    if (depth > 20) throw new Error("Local schema nesting is too deep");
    const name = `field${next++}`;
    let body: string;
    if (Array.isArray(node.enum) && node.enum.length) body = node.enum.map(literal).join(" | ");
    else if (node.type === "object" && node.properties) {
      const fields = Object.entries(node.properties).map(([key, value]) =>
        `${literal(key)} ${token(":")} space ${compile(value as Record<string, any>, depth + 1)}`);
      body = `${token("{")} space ${fields.join(` ${token(",")} space `)} ${token("}")} space`;
    } else if (node.type === "array") {
      const item = compile(node.items ?? {}, depth + 1);
      const maximum = Number.isInteger(node.maxItems) && node.maxItems >= 0 && node.maxItems <= 64 ? node.maxItems as number : null;
      const minimum = Number.isInteger(node.minItems) && node.minItems >= 0 ? node.minItems as number : 0;
      if (maximum !== null) {
        if (minimum > maximum) throw new Error("Invalid local array bounds");
        const variants = Array.from({ length: maximum - minimum + 1 }, (_, offset) => {
          const count = minimum + offset;
          return `${token("[")} space ${Array(count).fill(item).join(` ${token(",")} space `)} ${token("]")} space`;
        });
        body = variants.join(" | ");
      } else body = `${token("[")} space (${item} (${token(",")} space ${item})*)? ${token("]")} space`;
    } else if (node.type === "string") body = "jsonstring";
    else if (node.type === "integer") body = "jsoninteger";
    else if (node.type === "number") body = "jsonnumber";
    else if (node.type === "boolean") body = `${token("true")} space | ${token("false")} space`;
    else if (node.type === "null") body = `${token("null")} space`;
    else body = "jsonvalue";
    rules.push(`${name} ::= ${body}`);
    return name;
  }
  const root = schema.type === "object" && schema.properties ? compile(schema) : "jsonobject";
  return [`root ::= ${root}`, ...rules, String.raw`
space ::= [ \t\r\n]*
jsonstring ::= "\"" ([^"\\\x00-\x1f] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F]{4}))* "\"" space
jsoninteger ::= "-"? ("0" | [1-9] [0-9]*) space
jsonnumber ::= "-"? ("0" | [1-9] [0-9]*) ("." [0-9]+)? ([eE] [+-]? [0-9]+)? space
jsonvalue ::= jsonobject | jsonarray | jsonstring | jsonnumber | "true" space | "false" space | "null" space
jsonobject ::= "{" space (jsonstring ":" space jsonvalue ("," space jsonstring ":" space jsonvalue)*)? "}" space
jsonarray ::= "[" space (jsonvalue ("," space jsonvalue)*)? "]" space
`].join("\n");
}
