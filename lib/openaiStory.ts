import OpenAI from "openai";
import { hardRules } from "./safety";
import { STORY_POLICY_VERSION, storyPolicy, validateStory } from "@/packages/story-policy";
import { logEvent } from "./logger";
type Profile={name:string;age:number;preferredStoryMinutes:number;bedtimeTone:string;favoriteCharacters:string;favoriteThemes:string;avoidTopics:string;endingPreference:string};
export type GeneratedStory={title:string;estimatedMinutes:number;mode:string;characters:string[];narratorStyle:string;scenes:{title:string;emotionalArc:string;narrationNotes:string;text:string}[];fullText:string};
function demo(profile:Profile, mode:string, prompt:string):GeneratedStory { const theme=prompt||profile.favoriteThemes.split(",")[0]||"a cozy adventure"; const title=`${profile.name} and the Moonbeam Picnic`; const scenes=["A very small invitation","The giggle-glow path","A kind and cozy surprise","Home under the soft blankets"].map((title,i)=>({title,emotionalArc:["opening","playful","caring","sleepy"][i],narrationNotes:"Warm, slow, smiling narration",text:`${profile.name} found a tiny moonbeam note beside the pillow. “Tonight,” it said, “there is a picnic for ${theme}.” ${profile.name} smiled and invited a friendly animal companion along. They followed a silver path, shared gentle jokes, and helped someone who had dropped their warm soup. Nothing was scary; even the shadows were only sleepy trees. By the time the stars yawned, everyone was safe, cozy, loved, and ready for bed.`})); return {title,estimatedMinutes:profile.preferredStoryMinutes,mode,characters:[profile.name,"a friendly animal companion"],narratorStyle:"warm, playful bedtime reader",scenes,fullText:scenes.map(s=>s.text).join("\n\n")}; }
export async function generateStory(profile:Profile, mode:string, prompt:string, extra="",requestId?:string):Promise<GeneratedStory>{
 if(!process.env.OPENAI_API_KEY){logEvent("info","stories","story.generate.demo_fallback",{requestId});return demo(profile,mode,prompt)}
 const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY}); const schema={type:"object",properties:{title:{type:"string"},estimatedMinutes:{type:"number"},mode:{type:"string"},characters:{type:"array",items:{type:"string"}},narratorStyle:{type:"string"},scenes:{type:"array",items:{type:"object",properties:{title:{type:"string"},emotionalArc:{type:"string"},narrationNotes:{type:"string"},text:{type:"string"}},required:["title","emotionalArc","narrationNotes","text"],additionalProperties:false}},fullText:{type:"string"}},required:["title","estimatedMinutes","mode","characters","narratorStyle","scenes","fullText"],additionalProperties:false};
 let correction="";
 for(let attempt=0;attempt<2;attempt+=1){
  const attemptStartedAt=Date.now();
  logEvent("info","stories","story.provider.attempt.started",{requestId,attempt:attempt+1,model:process.env.OPENAI_TEXT_MODEL||"gpt-4.1-mini"});
  const response=await client.responses.create({model:process.env.OPENAI_TEXT_MODEL||"gpt-4.1-mini",input:[{role:"system",content:`Story policy ${STORY_POLICY_VERSION}: ${storyPolicy} ${hardRules} Return 4–6 scenes and about ${profile.preferredStoryMinutes*180} words. Avoid: ${profile.avoidTopics}. ${extra} ${correction}`},{role:"user",content:`Write a ${mode} for ${profile.name}, age ${profile.age}. Tone: ${profile.bedtimeTone}. Favorites: ${profile.favoriteCharacters}; ${profile.favoriteThemes}. Ending: ${profile.endingPreference}. Parent prompt: ${prompt}`}],text:{format:{type:"json_schema",name:"bedtime_story",strict:true,schema}}});
  const result=JSON.parse(response.output_text) as GeneratedStory;
  const validation=validateStory(result,prompt);
  logEvent(validation.ok?"info":"warn","stories",validation.ok?"story.provider.attempt.accepted":"story.provider.attempt.rejected",{requestId,attempt:attempt+1,durationMs:Date.now()-attemptStartedAt,validationIssueCount:validation.issues.length});
  if(validation.ok)return result;
  correction=`The previous result was rejected. Correct all of these issues: ${validation.issues.join(" ")}`;
 }
 logEvent("warn","stories","story.generate.safe_fallback",{requestId,reason:"provider_results_failed_validation"});
 return demo(profile,mode,prompt);
}
