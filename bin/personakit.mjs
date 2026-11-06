#!/usr/bin/env node
// Entry point. Node 22.18 or newer runs the TypeScript sources directly.
import { main } from "../src/cli/main.ts";

await main();
