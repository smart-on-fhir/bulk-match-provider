import { NextFunction, Request, RequestHandler, Response } from "express"
import lockfile from "proper-lockfile"


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

export function wait(ms: number, { unref }: { unref?: boolean } = {}) {
    return new Promise(resolve => {
        const timer = setTimeout(resolve, ms);
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
