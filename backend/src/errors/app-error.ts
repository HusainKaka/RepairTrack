export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (resource: string): AppError => new AppError(404, "NOT_FOUND", `${resource} was not found.`);

