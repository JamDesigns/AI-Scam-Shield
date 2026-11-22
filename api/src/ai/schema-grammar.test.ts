import { describe, expect, it } from "vitest";
import { schemaGrammar } from "./schema-grammar.js";
describe("explicit local JSON grammar", () => {
  it("starts at an object and restricts enums and empty summary reasons", () => {
    const grammar = schemaGrammar({type:'object',properties:{category:{type:'string',enum:['low_risk','high_risk']},reasons:{type:'array',items:{type:'string'},maxItems:0},explanation:{type:'string',enum:['local_summary']}}});
    expect(grammar).toContain('root ::= field0');
    expect(grammar).toContain('low_risk');
    expect(grammar).toContain('high_risk');
    expect(grammar).toContain('"[" space  "]" space');
    expect(grammar).not.toContain('thought');
  });
  it("escapes schema literals instead of allowing grammar injection", () => {
    const grammar = schemaGrammar({type:'object',properties:{'quote"\\\n':{type:'string',enum:['a"\\\n']}}});
    expect(grammar.split('\n').filter(line=>line.startsWith('root ::=')).length).toBe(1);
    expect(grammar).toContain('jsonstring ::=');
  });
  it("rejects contradictory array limits", () => {
    expect(()=>schemaGrammar({type:'object',properties:{items:{type:'array',minItems:2,maxItems:1}}})).toThrow('array bounds');
  });
});
