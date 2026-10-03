import type { Tool } from "../types.js";
import { editFile } from "./editFile.js";
import { readFile } from "./readFile.js";
import { runCommand } from "./runCommand.js";
import { search } from "./search.js";

export const defaultTools: Tool[] = [readFile, search, editFile, runCommand];
