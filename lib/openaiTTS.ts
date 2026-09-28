import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
export interface TTSProvider { generateSpeech(input:{text:string;voice:string;outputPath:string;previousText?:string;nextText?:string}):Promise<string> }
export class OpenAITTSProvider implements TTSProvider { async generateSpeech({text,voice,outputPath}:{text:string;voice:string;outputPath:string}) { if(!process.env.OPENAI_API_KEY) throw new Error("Add OPENAI_API_KEY to generate narration."); const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY}); const audio=await client.audio.speech.create({model:process.env.OPENAI_TTS_MODEL||"gpt-4o-mini-tts",voice:voice as "coral",input:text}); await fs.mkdir(path.dirname(outputPath),{recursive:true}); await fs.writeFile(outputPath,Buffer.from(await audio.arrayBuffer())); return outputPath; } }
