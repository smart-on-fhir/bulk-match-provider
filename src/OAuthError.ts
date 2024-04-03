import { OAuthErrorType } from "..";


export class OAuthError extends Error {
    type: OAuthErrorType;
    code: number;

    constructor(type: OAuthErrorType, message: string, code: number) {
        super(message);
        this.type = type;
        this.code = code;
    }
}

export class UnsupportedGrantTypeError extends OAuthError {
    constructor(message: string) {
        super("unsupported_grant_type", message, 400);
    }
}

export class UnauthorizedClientError extends OAuthError {
    constructor(message: string) {
        super("unauthorized_client", message, 403);
    }
}

export class InvalidGrantError extends OAuthError {
    constructor(message: string) {
        super("invalid_grant", message, 403);
    }
}

export class InvalidScopeError extends OAuthError {
    constructor(message: string) {
        super("invalid_scope", message, 403);
    }
}

export class InvalidRequestError extends OAuthError {
    constructor(message: string) {
        super("invalid_request", message, 400);
    }
}

export class InvalidClientError extends OAuthError {
    constructor(message: string) {
        super("invalid_client", message, 401);
    }
}
