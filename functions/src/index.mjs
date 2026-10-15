import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { createGardenService } from './service.mjs';

initializeApp();
const service = createGardenService(getFirestore());
const options = {region:'asia-east1', maxInstances:3, timeoutSeconds:60};
export const recordReading = onCall(options, request => service.record(request.auth?.uid, request.data));
export const updateReadingProfile = onCall(options, request => service.profile(request.auth?.uid, request.data));

export const updateReadingPlan = onCall(options, request => service.updatePlan(request.auth?.uid, request.data));

export const updateGardenReward = onCall(options, request => service.reward(request.auth?.uid, request.data));
export const renameReadingGarden = onCall(options, request => service.rename(request.auth?.uid, request.data));

export const previewReadingWithdrawal = onCall(options, request => service.previewWithdrawal(request.auth?.uid, request.data));
export const withdrawReading = onCall(options, request => service.withdraw(request.auth?.uid, request.data));

import {createCrossGardenService} from './cross-garden.mjs';
const crossGarden=createCrossGardenService(getFirestore());
export const recordSharedReading = onCall(options, request => crossGarden.record(request.auth?.uid,request.data));
export const previewSharedWithdrawal = onCall(options, request => crossGarden.previewWithdrawal(request.auth?.uid,request.data));
export const withdrawSharedReading = onCall(options, request => crossGarden.withdraw(request.auth?.uid,request.data));
