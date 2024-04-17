import jwt              from "jsonwebtoken" 
import lockfile         from "proper-lockfile"
import config           from "./config"
import { Unauthorized } from "./HttpError"
import {
    InvalidClientError,
    InvalidScopeError,
    UnauthorizedClientError
} from "./OAuthError"
import type {
    NextFunction,
    Request,
    RequestHandler,
    Response
} from "express"
import app from ".."


export function toArray(x: any): (typeof x)[] {
    if (x === undefined) {
        return []
    }

    if (Array.isArray(x)) {
        return x
    }

    if (x && typeof x === "object" && typeof x.toArray === "function") {
        return x.toArray()
    }

    return [x]
}

export function uInt(x: any, defaultValue = 0) {
    x = parseInt(x + "", 10);
    if (isNaN(x) || !isFinite(x) || x < 0) {
        x = uInt(defaultValue, 0);
    }
    return x;
}

/**
 * Creates and returns a route-wrapper function that allows for using an async
 * route handlers without try/catch.
 */
export function asyncRouteWrap(fn: RequestHandler) {
    return (req: Request, res: Response, next: NextFunction) => Promise.resolve(
        fn(req, res, next)
    ).catch(next);
}

/**
 * Given a request object, returns its base URL
 */
export function getRequestBaseURL(req: Request) {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    return protocol + "://" + host;
}

export function createOperationOutcome(message: any, {
    issueCode = "processing", // http://hl7.org/fhir/valueset-issue-type.html
    severity  = "error"       // fatal | error | warning | information
}: {
    issueCode?: string
    severity?: "fatal" | "error" | "warning" | "information"
} = {}): fhir4.OperationOutcome
{
    message = String(message)

    return {
        resourceType: "OperationOutcome",
        text: {
            status: "generated",
            div: `<div xmlns="http://www.w3.org/1999/xhtml">` +
                `<h1>Operation Outcome</h1><table border="0"><tr>` +
                `<td style="font-weight:bold;">${severity}</td>` +
                `<td><pre>${htmlEncode(message)}</pre></td></tr></table></div>`
        },
        issue: [
            {
                severity,
                code       : issueCode,
                diagnostics: message
            }
        ]
    };
}

/**
 * Escapes an HTML string by replacing special characters with the corresponding
 * html entities
 */
export function htmlEncode(html: string): string {
    return String(html)
        .trim()
        .replace(/&/g, "&amp;" )
        .replace(/</g, "&lt;"  )
        .replace(/>/g, "&gt;"  )
        .replace(/"/g, "&quot;");
}

export function wait(ms: number, { unref, signal }: {
    unref ?: boolean
    signal?: AbortSignal
} = {}): Promise<void> {

    // If waiting is aborted resolve immediately
    if (signal?.aborted) {
        return Promise.resolve()
    }

    return new Promise(resolve => {
        
        const timer = setTimeout(doResolve, ms);

        function doResolve() {
            clearTimeout(timer)
            if (signal) {
                signal.removeEventListener("abort", doResolve)
            }
            resolve()
        }

        if (signal) {
            signal.addEventListener("abort", doResolve)
        }

        if (unref) {
            timer.unref()
        }
    });
}

export async function lock(path: string): Promise<() => Promise<void>> {
    await lockfile.lock(path, {
        realpath: false,
        retries: {
            unref: true,
            minTimeout: 20,
            retries: 100,
            factor: 1
        }
    });
    return () => lockfile.unlock(path, { realpath: false });
}

export function bundle<T extends fhir4.Resource>(resources: T[], baseUrl: string): fhir4.Bundle<T> {
    return {
        resourceType: "Bundle",
        type: "searchset",
        total: resources.length,
        entry: resources.map(resource => ({
            fullUrl: `${baseUrl}/fhir/${resource.resourceType}/${resource.id}`,
            resource,
            search: {
                mode: "match"
            }
        }))
    };
}

export function checkAuth(req: Request, res: Response, next: NextFunction)
{
    if (req.headers.authorization) {
        try {
            var token = jwt.verify(
                req.headers.authorization.split(" ")[1],
                config.jwtSecret,
                {
                    algorithms: [ "HS256" ] // That is what we use for signing the access tokens
                }
            ) as app.AccessToken;
        } catch (e) {
            /* istanbul ignore next */
            if (process.env.NODE_ENV !== "test") {
                console.error(e)
            }
            throw new Unauthorized("Invalid token: " + (e as Error).message);
        }

        const client = jwt.decode(token.client_id) as app.RegisteredClient
        (req as app.Request).registeredClient = client

        if (client.err === "expired_access_token") {
            throw new InvalidClientError("Access token expired (simulated error)")
        } else if (client.err === "invalid_access_token") {
            throw new InvalidClientError("Invalid access token (simulated error)");
        } else if (client.err === "invalid_scope") {
            throw new InvalidScopeError("Invalid scope (simulated error)");
        } else if (client.err === "unauthorized_client") {
            throw new UnauthorizedClientError("Unauthorized client (simulated error)");
        }
    }

    next();
}