import {createHash,randomUUID} from 'node:crypto';
import {displayCue} from './caption-view.mjs';
import {validateProject} from './project.mjs';
import {cutTimelineRanges} from './precision.mjs';
import {textCutRanges} from './text-cut-model.mjs';
export const textCutFingerprint=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
export function prepareTextCut(project,options,revision=0){const before=validateProject(project),proposal=textCutRanges(before,options),candidate=cutTimelineRanges(before,proposal.cuts);return{id:randomUUID(),projectId:before.id,fingerprint:textCutFingerprint(project),revision,proposal:{...proposal,afterClipCount:candidate.timeline.clips.length,afterCueCount:candidate.cues.length,reviewCueCount:candidate.cues.filter(c=>c.textCutReview).length,translationReviewCount:candidate.cues.filter(c=>Object.values(c.translations??{}).some(t=>t.sourceText.replace(/\s+/g,' ').trim()!==c.text.replace(/\s+/g,' ').trim())).length,previewCues:candidate.cues.map(c=>{const shown=displayCue(c,candidate);return{start:shown.start,end:shown.end,text:shown.text,words:shown.words??[],speakerColor:shown.speakerColor};})},candidate};}
export function publicTextCut(plan){return plan?{id:plan.id,revision:plan.revision,...plan.proposal}:null;}
export function applyTextCut(project,plan,id){if(!plan||plan.id!==id||plan.projectId!==project.id||plan.fingerprint!==textCutFingerprint(project))throw new Error('El proyecto cambió después de preparar los cortes. Genera otra propuesta.');return structuredClone(plan.candidate);}
