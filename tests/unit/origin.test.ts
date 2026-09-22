import { describe,it,expect } from "vitest";
import { hasSameOrigin } from "@/lib/auth/origin";
describe("browser Origin validation",()=>{
 it("accepts the real Host when Next normalizes the internal URL",()=>{
  expect(hasSameOrigin(new Request("http://localhost:3000/api",{headers:{host:"127.0.0.1:3000",origin:"http://127.0.0.1:3000","sec-fetch-site":"same-origin"}}))).toBe(true);
 });
 it("rejects another host even when it claims same-origin",()=>{
  expect(hasSameOrigin(new Request("http://localhost:3000/api",{headers:{host:"127.0.0.1:3000",origin:"https://evil.example","sec-fetch-site":"same-origin"}}))).toBe(false);
 });
 it("rejects explicit cross-site requests without an Origin",()=>{
  expect(hasSameOrigin(new Request("http://localhost:3000/api",{headers:{"sec-fetch-site":"cross-site"}}))).toBe(false);
 });
});

