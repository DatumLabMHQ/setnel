'use server';

import { revalidatePath } from 'next/cache';
import { isAuthed } from '@/lib/session';
import { audit } from '@/lib/admin';
import { currentActor } from '@/lib/users';
import { setSignalStatus, type SignalStatus } from '@/lib/signals';

async function guard() {
  if (!(await isAuthed())) throw new Error('unauthorized');
}

async function setStatus(formData: FormData, status: SignalStatus) {
  await guard();
  const id = String(formData.get('id'));
  const who = await currentActor();
  await setSignalStatus(id, status);
  await audit(who, `signal.${status}`, id);
  revalidatePath('/setnel/content');
}

export async function markSignalUsed(formData: FormData) { await setStatus(formData, 'used'); }
export async function dismissSignal(formData: FormData) { await setStatus(formData, 'dismissed'); }
export async function reopenSignal(formData: FormData) { await setStatus(formData, 'new'); }
