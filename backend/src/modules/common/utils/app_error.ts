import HTTP_STATUS from "./status_codes.js";

export class ApiError extends Error {
  public status: number;

  constructor(message: string, status: number = HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export default ApiError;

