'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { checkPassword, createSession } from '@/lib/session';
import { resolveAllowedUser, createLoginToken } from '@/lib/users';
import { emailConfigured, sendMail } from '@/lib/notify';

// Break-glass: shared team password → team session (admin fallback).
export async function login(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  if (!checkPassword(password)) {
    redirect('/login?error=1');
  }
  await createSession();
  redirect('/setnel');
}

// Primary sign-in: request a magic link. Public (email IS the front door), but
// only whitelisted emails get a link. If email isn't configured yet, the link is
// shown on-page as a bootstrap fallback.
export async function requestMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email.includes('@')) redirect('/login?denied=1');

  const user = await resolveAllowedUser(email);
  if (!user) redirect('/login?denied=1');

  const token = await createLoginToken(user.id);
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'setnel-hub.datumlabs.workers.dev';
  const link = `${proto}://${host}/login/verify?token=${token}`;

  if (emailConfigured()) {
    await sendMail('Sign in to Setnel', `Hi ${user.name},\n\nClick to sign in to Setnel:\n\n${link}\n\nThis link expires in 20 minutes. If you didn't request it, ignore this email.`, [user.email]);
    redirect('/login?sent=1');
  }
  redirect(`/login?link=${encodeURIComponent(link)}`);
}
