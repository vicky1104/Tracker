/** An error whose message is safe and helpful to show to the user as-is. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof UserFacingError) return error.message;
  if (__DEV__ && error instanceof Error) return error.message;
  return fallback;
}
