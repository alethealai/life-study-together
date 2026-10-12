import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {migrateReadModels} from './src/migrate-read-models.mjs';
const [projectId,gardenId,flag]=process.argv.slice(2);
if(!projectId||!gardenId||!/^[\w-]+$/.test(gardenId)||(flag&&flag!=='--apply-reviewed'))throw new Error('Usage: node functions/migrate-read-models.mjs PROJECT GARDEN [--apply-reviewed]');
initializeApp({projectId});
const report=await migrateReadModels(getFirestore(),gardenId,flag==='--apply-reviewed');
console.log(JSON.stringify({...report,applied:flag==='--apply-reviewed'&&!report.issues.length},null,2));
if(report.issues.length)process.exitCode=1;
