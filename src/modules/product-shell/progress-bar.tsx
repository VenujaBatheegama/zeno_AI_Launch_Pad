"use client";

import { AppProgressBar } from 'next-nprogress-bar';

export function GlobalProgressBar() {
  return (
    <AppProgressBar
      height="3px"
      color="var(--zeno-primary)"
      options={{ showSpinner: false }}
      shallowRouting
    />
  );
}
