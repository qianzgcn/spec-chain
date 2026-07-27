export type ActionResult<T = undefined> =
  | {
      ok: true;
      message?: string;
      data?: T;
    }
  | {
      ok: false;
      message: string;
      fieldErrors?: Record<string, string[]>;
    };
