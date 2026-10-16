const fs=require('node:fs'),path=require('node:path');
const repo=process.argv[2];const ts=require(path.join(repo,'node_modules/typescript'));
const targets={verticalDramaSeries:['previewPromptExpansion','generateStoryBible','synthesizeGenrePreset','proposeSeasonCarryOver','proposeSpecialEditionBrief','requestSourceAnalysis','suggestSourceDescription'],verticalDramaCharacters:['detectCharacterVariantsNow','analyzeCharacterDuplicates'],verticalDramaLocations:['detectLocationsNow'],verticalDramaEpisodes:['generateShotStartFramePrompt','generateShotReferenceFramePrompt']};
const result=[];
for(const [file,names] of Object.entries(targets)) {
 const p=`apps/web/server/routers/${file}.ts`;const text=fs.readFileSync(path.join(repo,p),'utf8');const sf=ts.createSourceFile(p,text,ts.ScriptTarget.Latest,true);const found=new Map();
 function find(n) {if(ts.isPropertyAssignment(n)&&names.includes(n.name.getText(sf)))found.set(n.name.getText(sf),n);ts.forEachChild(n,find)}find(sf);
 for(const name of names){const property=found.get(name);if(!property)throw Error('Missing procedure '+name);let callback;
 function handler(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='mutation'&&n.arguments[0]&&ts.isArrowFunction(n.arguments[0]))callback=n.arguments[0];ts.forEachChild(n,handler)}handler(property.initializer);
 if(!callback||!ts.isBlock(callback.body))throw Error('Missing callback '+name);
 let calls=[];let returned=false;let unreachable=0;
 for(const stmt of callback.body.statements){if(returned){unreachable++;continue;}function collect(n){if(ts.isCallExpression(n))calls.push(n.expression.getText(sf));ts.forEachChild(n,collect)}collect(stmt);if(ts.isReturnStatement(stmt))returned=true;}
 const denied=calls.filter(x=>/invokeLLM|executeSkill|generateStoryBible(?!Job)|generateStartFrameShotPrompt|expandVerticalDramaPrompt|detectVerticalDramaLocations|planVerticalDramaCharacter|synthesizeVerticalDramaGenrePreset/.test(x));
 if(denied.length)throw Error('Direct provider service '+name+': '+denied.join(','));
 if(!calls.some(c=>/^enqueueVerticalDrama/.test(c)||c==='requestSourceAnalysis'))throw Error('No enqueue boundary '+name);
 result.push({path:p,procedure:name,line:sf.getLineAndCharacterOfPosition(property.getStart(sf)).line+1,calls,unreachableStatementsAfterReturn:unreachable,result:'PASS_DIRECT_CALL_BOUNDARY'});
 }
}
const p='apps/web/server/services/verticalDramaSourceIngestionService.ts';const text=fs.readFileSync(path.join(repo,p),'utf8');const sf=ts.createSourceFile(p,text,ts.ScriptTarget.Latest,true);let fn;
for(const n of sf.statements)if(ts.isFunctionDeclaration(n)&&n.name?.text==='requestSourceAnalysis')fn=n;
if(!fn?.body)throw Error('Missing source analysis entry');let calls=[];function collectSource(n){if(ts.isCallExpression(n))calls.push(n.expression.getText(sf));ts.forEachChild(n,collectSource)}collectSource(fn.body);
if(!calls.includes('enqueueVerticalDramaInteractiveJob')||calls.some(x=>/invokeLLM|executeSkill|runQueuedSourceAnalysis/.test(x)))throw Error('Invalid source analysis boundary: '+JSON.stringify(calls));
console.log(JSON.stringify({sourceSha:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),profile:'quick',kind:'READ_ONLY_TYPESCRIPT_AST_BOUNDARY_VALIDATION',observedAt:new Date().toISOString(),procedures:result,sourceAnalysisAdapter:{path:p,calls,result:'PASS_ENQUEUE_BOUNDARY'},limit:'Direct executable body inspection of 12 initial affected procedures plus one source-analysis adapter. This is static source evidence; does not prove DB/provider latency, all existing queued flows, real worker execution or browser acceptance.',requirementsClosed:[]},null,2));
