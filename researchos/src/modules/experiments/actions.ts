'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { guard, num, optStr, str } from '@/lib/guard';
import * as svc from './service';

const list = (p: string) => `/p/${p}/experiments`;
const one = (p: string, e: string) => `/p/${p}/experiments/${e}`;
const lab = (p: string) => `/p/${p}/lab`;

export async function createProtocolAction(projectId: string, fd: FormData) {
  await guard(list(projectId), async () => {
    const { db } = await requireUser();
    await svc.createProtocol(db, projectId, { title: str(fd, 'title'), objective: optStr(fd, 'objective'), body: str(fd, 'body') });
    revalidatePath(list(projectId));
  });
}
export async function addProtocolVersionAction(projectId: string, protocolId: string, fd: FormData) {
  await guard(list(projectId), async () => {
    const { db } = await requireUser();
    await svc.addProtocolVersion(db, projectId, protocolId, str(fd, 'body'), optStr(fd, 'change_note'));
    revalidatePath(list(projectId));
  });
}
export async function createExperimentAction(projectId: string, fd: FormData) {
  await guard(list(projectId), async () => {
    const { db } = await requireUser();
    const id = await svc.createExperiment(db, projectId, { title: str(fd, 'title'), code: optStr(fd, 'code'), hypothesis_id: optStr(fd, 'hypothesis_id'), protocol_version_id: optStr(fd, 'protocol_version_id'), design: optStr(fd, 'design') });
    return one(projectId, id);
  });
}
export async function setExperimentStatusAction(projectId: string, id: string, fd: FormData) {
  await guard(one(projectId, id), async () => {
    const { db } = await requireUser();
    await svc.setExperimentStatus(db, id, str(fd, 'status'));
    revalidatePath(one(projectId, id));
  });
}
export async function addGroupAction(projectId: string, id: string, fd: FormData) {
  await guard(one(projectId, id), async () => {
    const { db } = await requireUser();
    await svc.addGroup(db, projectId, id, { name: str(fd, 'name'), treatment: optStr(fd, 'treatment'), n: num(fd, 'n'), description: optStr(fd, 'description') });
    revalidatePath(one(projectId, id));
  });
}
export async function uploadDatasetAction(projectId: string, id: string, fd: FormData) {
  await guard(one(projectId, id), async () => {
    const { db } = await requireUser();
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('Selecione um arquivo.');
    const layer = str(fd, 'layer') === 'processed' ? 'processed' : 'raw';
    await svc.uploadDataset(db, projectId, id, { layer, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), groupId: optStr(fd, 'group_id'), derivedFrom: optStr(fd, 'derived_from'), method: optStr(fd, 'method'), notes: optStr(fd, 'notes') });
    revalidatePath(one(projectId, id));
  });
}
export async function archiveDatasetAction(projectId: string, id: string, datasetId: string) {
  await guard(one(projectId, id), async () => {
    const { db } = await requireUser();
    await svc.archiveDataset(db, datasetId);
    revalidatePath(one(projectId, id));
  });
}
export async function addInterpretationAction(projectId: string, id: string, fd: FormData) {
  await guard(one(projectId, id), async () => {
    const { db } = await requireUser();
    await svc.addInterpretation(db, projectId, id, { body: str(fd, 'body'), dataset_id: optStr(fd, 'dataset_id') });
    revalidatePath(one(projectId, id));
  });
}
export async function addResultAction(projectId: string, id: string, fd: FormData) {
  await guard(one(projectId, id), async () => {
    const { db } = await requireUser();
    await svc.addResult(db, projectId, id, { statement: str(fd, 'statement'), interpretation_id: optStr(fd, 'interpretation_id'), group_id: optStr(fd, 'group_id'), metric: optStr(fd, 'metric'), value: num(fd, 'value'), unit: optStr(fd, 'unit'), stat_test: optStr(fd, 'stat_test'), p_value: num(fd, 'p_value') });
    revalidatePath(one(projectId, id));
  });
}
export async function finalizeResultAction(projectId: string, id: string, resultId: string) {
  await guard(one(projectId, id), async () => {
    const { db } = await requireUser();
    await svc.finalizeResult(db, resultId);
    revalidatePath(one(projectId, id));
  });
}
export async function downloadDatasetAction(projectId: string, id: string, storagePath: string) {
  await guard(one(projectId, id), async () => {
    const { db } = await requireUser();
    return svc.signedDatasetUrl(db, storagePath);
  });
}

// ---- caderno e reagentes ---------------------------------------------------------
export async function addNotebookAction(projectId: string, fd: FormData) {
  await guard(lab(projectId), async () => {
    const { db } = await requireUser();
    await svc.addNotebookEntry(db, projectId, { experiment_id: optStr(fd, 'experiment_id'), title: str(fd, 'title'), body: str(fd, 'body'), entry_date: optStr(fd, 'entry_date'), amends_id: optStr(fd, 'amends_id') });
    revalidatePath(lab(projectId));
  });
}
export async function updateNotebookAction(projectId: string, id: string, fd: FormData) {
  await guard(lab(projectId), async () => {
    const { db } = await requireUser();
    await svc.updateNotebookEntry(db, id, str(fd, 'body'));
    revalidatePath(lab(projectId));
  });
}
export async function signNotebookAction(projectId: string, id: string) {
  await guard(lab(projectId), async () => {
    const { db, user } = await requireUser();
    await svc.signNotebookEntry(db, id, user.id);
    revalidatePath(lab(projectId));
  });
}
export async function createReagentAction(projectId: string, fd: FormData) {
  await guard(lab(projectId), async () => {
    const { db } = await requireUser();
    await svc.createReagent(db, projectId, { name: str(fd, 'name'), supplier: optStr(fd, 'supplier'), catalog_number: optStr(fd, 'catalog_number'), storage_conditions: optStr(fd, 'storage_conditions') });
    revalidatePath(lab(projectId));
  });
}
export async function addLotAction(projectId: string, fd: FormData) {
  await guard(lab(projectId), async () => {
    const { db } = await requireUser();
    await svc.addLot(db, projectId, { reagent_id: str(fd, 'reagent_id'), lot_number: str(fd, 'lot_number'), expires_on: optStr(fd, 'expires_on'), quantity: num(fd, 'quantity'), unit: optStr(fd, 'unit') });
    revalidatePath(lab(projectId));
  });
}
export async function useReagentAction(projectId: string, id: string, fd: FormData) {
  await guard(one(projectId, id), async () => {
    const { db } = await requireUser();
    await svc.useReagent(db, projectId, id, { reagent_id: str(fd, 'reagent_id'), lot_id: optStr(fd, 'lot_id'), amount: num(fd, 'amount'), unit: optStr(fd, 'unit') });
    revalidatePath(one(projectId, id));
  });
}
