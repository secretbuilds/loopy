#!/usr/bin/env node
import { buildProgram, realDeps } from "./cli.js";

buildProgram(realDeps()).parseAsync(process.argv);
