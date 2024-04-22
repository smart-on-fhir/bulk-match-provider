import { STATUS_CODES } from "http"

interface ErrorData {
    cause?: any
    [key: string]: any
}

interface HttpErrorFactory extends ErrorConstructor {
    (): HttpError
    (arg: string): HttpError
    (arg: string, data: ErrorData): HttpError
    (arg: { message?: string, [key: keyof ErrorData]: any }): HttpError
    new (): HttpError
    new (arg: string): HttpError
    new (arg: string, data: ErrorData): HttpError
    new (arg: { message?: string, [key: keyof ErrorData]: any }): HttpError
}

const map = {
    BadRequest                    : 400, Unauthorized                  : 401,
    PaymentRequired               : 402, Forbidden                     : 403,
    NotFound                      : 404, MethodNotAllowed              : 405,
    NotAcceptable                 : 406, ProxyAuthenticationRequired   : 407,
    RequestTimeout                : 408, Conflict                      : 409,
    Gone                          : 410, LengthRequired                : 411,
    PreconditionFailed            : 412, PayloadTooLarge               : 413,
    URITooLong                    : 414, UnsupportedMediaType          : 415,
    RangeNotSatisfiable           : 416, ExpectationFailed             : 417,
    ImATeapot                     : 418, MisdirectedRequest            : 421,
    UnprocessableEntity           : 422, Locked                        : 423,
    FailedDependency              : 424, TooEarly                      : 425,
    UpgradeRequired               : 426, PreconditionRequired          : 428,
    TooManyRequests               : 429, RequestHeaderFieldsTooLarge   : 431,
    UnavailableForLegalReasons    : 451, InternalServerError           : 500,
    NotImplemented                : 501, BadGateway                    : 502,
    ServiceUnavailable            : 503, GatewayTimeout                : 504,
    HTTPVersionNotSupported       : 505, VariantAlsoNegotiates         : 506,
    InsufficientStorage           : 507, LoopDetected                  : 508,
    BandwidthLimitExceeded        : 509, NotExtended                   : 510,
    NetworkAuthenticationRequired : 511,
}

class HttpError extends Error
{
    public readonly http = true
    public statusCode: number
    public status: number
    public override name: string
    public override message: string
    public data?: ErrorData
    public cause?: any

    constructor(code: number, message?: string, data?: ErrorData) {
        // @ts-ignore
        super(message || STATUS_CODES[code + ""]!, data?.cause)
        this.statusCode = code
        this.status     = code
        this.name       = this.constructor.name
        this.message    = message || STATUS_CODES[code + ""]!
        this.data       = data
        if (data && data.cause) {
            this.cause = data.cause
        }
        Error.captureStackTrace(this, this.constructor)
    }

    toJSON() {
        return {
            name      : this.name,
            message   : this.message,
            statusCode: this.statusCode,
            http      : true
        }
    }
}

export function createError(code: number)
{
    const name = Object.keys(map).find(k => map[k as keyof typeof map] === code)

    if (!name) {
        throw new Error(`Invalid http error code ${JSON.stringify(code)}`)
    }

    const httpErrorFactory = function(arg?: string | { message?: string, [key: keyof ErrorData]: any }, data?: ErrorData): HttpError {
        let error: HttpError;
        if (!arg) {
            error = new HttpError(code)
        } else if (typeof arg === "string") {
            error = new HttpError(code, arg, data)
        } else {
            const { message, ...rest } = arg
            error = new HttpError(code, message, rest)
        }
        error.name = name
        Error.captureStackTrace(error, httpErrorFactory)
        Object.defineProperty(httpErrorFactory, 'name', { value: name });
        return error
    } as HttpErrorFactory;

    return httpErrorFactory
}

export const  BadRequest                    = createError(400)
export const  Unauthorized                  = createError(401)
export const  PaymentRequired               = createError(402)
export const  Forbidden                     = createError(403)
export const  NotFound                      = createError(404)
export const  MethodNotAllowed              = createError(405)
export const  NotAcceptable                 = createError(406)
export const  ProxyAuthenticationRequired   = createError(407)
export const  RequestTimeout                = createError(408)
export const  Conflict                      = createError(409)
export const  Gone                          = createError(410)
export const  LengthRequired                = createError(411)
export const  PreconditionFailed            = createError(412)
export const  PayloadTooLarge               = createError(413)
export const  URITooLong                    = createError(414)
export const  UnsupportedMediaType          = createError(415)
export const  RangeNotSatisfiable           = createError(416)
export const  ExpectationFailed             = createError(417)
export const  ImATeapot                     = createError(418)
export const  MisdirectedRequest            = createError(421)
export const  UnprocessableEntity           = createError(422)
export const  Locked                        = createError(423)
export const  FailedDependency              = createError(424)
export const  TooEarly                      = createError(425)
export const  UpgradeRequired               = createError(426)
export const  PreconditionRequired          = createError(428)
export const  TooManyRequests               = createError(429)
export const  RequestHeaderFieldsTooLarge   = createError(431)
export const  UnavailableForLegalReasons    = createError(451)
export const  InternalServerError           = createError(500)
export const  NotImplemented                = createError(501)
export const  BadGateway                    = createError(502)
export const  ServiceUnavailable            = createError(503)
export const  GatewayTimeout                = createError(504)
export const  HTTPVersionNotSupported       = createError(505)
export const  VariantAlsoNegotiates         = createError(506)
export const  InsufficientStorage           = createError(507)
export const  LoopDetected                  = createError(508)
export const  BandwidthLimitExceeded        = createError(509)
export const  NotExtended                   = createError(510)
export const  NetworkAuthenticationRequired = createError(511)

