import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
const prisma = new PrismaClient();
async function main() {
  await prisma.appSettings.upsert({where:{id:"default"},update:{},create:{id:"default"}});
  const profiles=[
    {name:"Emma",age:4,preferredStoryMinutes:6,bedtimeTone:"cozy, silly, warm, gentle",favoriteCharacters:"Gabby-style cat adventures, Poppy, Doc McStuffins-style toy doctor stories, Vida the Vet-style animal care stories, animals, Mommy, Daddy",favoriteThemes:"cozy soup, sleepovers, being cared for",avoidTopics:"butterflies unless explicitly requested",endingPreference:"Everyone safe, cozy, loved, and tucked into bed",notes:""},
    {name:"Luke",age:5,preferredStoryMinutes:6,bedtimeTone:"funny, adventurous, energetic, then calm",favoriteCharacters:"Ninjago-style ninja adventures, Wild Kratts-style animal adventures, Sonic-style speedy adventures, TMNT-style heroes",favoriteThemes:"dinosaurs, silly villains",avoidTopics:"",endingPreference:"Action winds down into a calm bedtime ending",notes:""},
    {name:"Older Kid Template",age:10,preferredStoryMinutes:7,bedtimeTone:"clever, adventurous, funny, suspenseful but not scary",favoriteCharacters:"",favoriteThemes:"historical adventures, puzzles, survival quests, fantasy, space, sports, choose-your-own-adventure",avoidTopics:"",endingPreference:"A calm stopping point or chapter cliffhanger",notes:""}
  ]; for(const p of profiles) await prisma.childProfile.upsert({where:{name:p.name},update:p,create:p});
  const emma=await prisma.childProfile.findUnique({where:{name:"Emma"}});
  if(emma) {
    const token = process.env.EMMA_DEVICE_TOKEN || "emma-room-dev-token";
    const pepper = process.env.DEVICE_TOKEN_PEPPER || "local-development-only";
    const tokenHash = createHash("sha256").update(`${pepper}:${token}`).digest("hex");
    await prisma.deviceNode.upsert({
      where:{id:"emma-room"},
      update:{assignedChildId:emma.id,tokenHash},
      create:{id:"emma-room",name:"Emma's bedside",location:"Emma's room",assignedChildId:emma.id,tokenHash}
    });
  }
}
main().finally(()=>prisma.$disconnect());
