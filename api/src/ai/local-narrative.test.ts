import { describe, expect, it, vi } from "vitest";
import { translateLocalNarrative } from "./local-narrative.js";
const source = {riskScore:95,category:'high_risk',threatType:'bank_phishing',confidence:'high',input:'Original OCR https://original.example',reasons:['Requests a password.','Threatens to block the account.'],explanation:'Do not share your password or verification codes. Contact the bank directly.'};
const translated=['Demana una contrasenya.','Amenaça amb bloquejar el compte.','No compartiu la contrasenya ni els codis de verificació. Contacteu directament amb el banc.'];
const endpoint=new URL('http://localhost:8081/translate');
const setup=(body:unknown,status=200)=>({endpoint,signal:new AbortController().signal,fetchImpl:vi.fn<typeof fetch>().mockResolvedValue(Response.json(body,{status}))});
describe('detailed offline narratives',()=>{
 it('keeps evidence fields and scores immutable while translating every reason in order',async()=>{
  const original=structuredClone(source),options=setup({provider:'madlad400-3b-ct2-int8',targetLanguage:'ca',texts:translated});
  const result=await translateLocalNarrative(source,'ca-AD',options);
  expect(result).toEqual({...source,reasons:translated.slice(0,2),explanation:translated[2]});
  expect(source).toEqual(original);
  const request=JSON.parse(String(options.fetchImpl.mock.calls[0][1]?.body));
  expect(request).toEqual({sourceLanguage:'en',targetLanguage:'ca',texts:[...source.reasons,source.explanation]});
  expect(JSON.stringify(request)).not.toContain(source.input);
  expect(options.fetchImpl.mock.calls[0][1]).toMatchObject({redirect:'error',signal:options.signal});
 });
 it('bypasses English and original-language transcripts without contacting a service',async()=>{
  const options=setup({});expect(await translateLocalNarrative(source,'en-GB',options)).toBe(source);
  const transcript={transcript:'Ná roinn do phasfhocal.'};expect(await translateLocalNarrative(transcript,undefined,options)).toBe(transcript);
  expect(await translateLocalNarrative(transcript,'ga',options)).toBe(transcript);expect(options.fetchImpl).not.toHaveBeenCalled();
 });
 it.each([
  {provider:'other',targetLanguage:'ca',texts:translated},
  {provider:'madlad400-3b-ct2-int8',targetLanguage:'ga',texts:translated},
  {provider:'madlad400-3b-ct2-int8',targetLanguage:'ca',texts:translated.slice(0,1)},
  {provider:'madlad400-3b-ct2-int8',targetLanguage:'ca',texts:['',...translated.slice(1)]},
  {provider:'madlad400-3b-ct2-int8',targetLanguage:'ca',texts:[...source.reasons,source.explanation]},
 ])('rejects incorrect, missing or untranslated output %#',async body=>{
  await expect(translateLocalNarrative(source,'ca',setup(body))).rejects.toThrow();
 });
 it('fails closed when the model or service is unavailable',async()=>{
  await expect(translateLocalNarrative(source,'ga',{...setup({}),endpoint:null})).rejects.toThrow('require');
  await expect(translateLocalNarrative(source,'ga',setup({},503))).rejects.toThrow('503');
 });
 it('propagates cancellation before dispatching translation',async()=>{
  const options=setup({}),controller=new AbortController();controller.abort(new Error('Cancelled'));
  await expect(translateLocalNarrative(source,'ca',{...options,signal:controller.signal})).rejects.toThrow('Cancelled');
  expect(options.fetchImpl).not.toHaveBeenCalled();
 });
 it('rejects excessive source arrays without issuing translation requests',async()=>{
  const options=setup({});await expect(translateLocalNarrative({...source,reasons:Array(11).fill('reason')},'ga',options)).rejects.toThrow();expect(options.fetchImpl).not.toHaveBeenCalled();
 });
});
