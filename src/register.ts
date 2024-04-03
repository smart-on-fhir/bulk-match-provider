import { Request, Response }   from "express"
import jwt                     from "jsonwebtoken"
import { InvalidRequestError } from "./OAuthError"
import config                  from "./config"
import { uInt }                from "./lib"


export function register(req: Request, res: Response) {

    // console.log(req.body)
        
    // Require "application/x-www-form-urlencoded" POSTs
    if (!req.headers["content-type"] || req.headers["content-type"].indexOf("application/x-www-form-urlencoded") !== 0) {
        throw new InvalidRequestError("Invalid request content-type header (must be 'application/x-www-form-urlencoded')");
    }

    // Clients can register either by JWKS or by JWKS URL
    let jwks     = String(req.body.jwks     || "").trim();
    let jwks_url = String(req.body.jwks_url || "").trim();
    if (!jwks && !jwks_url) {
        throw new InvalidRequestError("Either 'jwks' or 'jwks_url' is required");
    }

    try {
        var jwksJSON = jwks ? JSON.parse(jwks) : undefined
    } catch (ex) {
        throw new InvalidRequestError("Cannot parse 'jwks' as JSON");
    }

    // Build the result token
    let jwtToken: Record<string, any> = {
        jwks                : jwksJSON,
        jwks_url            : jwks_url || undefined,
        accessTokensExpireIn: uInt(req.body.accessTokensExpireIn, 0) || undefined,
        fakeMatches         : uInt(req.body.fakeMatch, 0),
        duplicates          : uInt(req.body.duplicates, 0),
        err                 : req.body.err
    };

    // Reply with signed token as text
    res.type("text").send(jwt.sign(jwtToken, config.jwtSecret));
};
