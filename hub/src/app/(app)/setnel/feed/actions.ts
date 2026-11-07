'use server';

import { revalidatePath } from 'next/cache';
import { isAuthed } from '@/lib/session';
import { audit } from '@/lib/admin';
import { currentActor } from '@/lib/users';
import { setNewsStatus } from '@/lib/news';
import { setSignalStatus } from '@/lib/signals';

async function guard() { if (!(await isAuthed())) throw new Error('unauthorized'); }

export async function dismissNewsItem(formData: FormData) {
  await guard();
  const id = String(formData.get('id'));
  await setNewsStatus(id, 'dismissed');
  await audit(await currentActor(), 'news.dismissed', id);
  revalidatePath('/setnel/feed');
}

// The item's content signal is the same row the Content page acts on, so marking it used here
// marks it used there too.
export async function markNewsSignalUsed(formData: FormData) {
  await guard();
  const signalId = String(formData.get('signalId'));
  await setSignalStatus(signalId, 'used');
  await audit(await currentActor(), 'signal.used', signalId);
  revalidatePath('/setnel/feed'); revalidatePath('/setnel/content');
}
