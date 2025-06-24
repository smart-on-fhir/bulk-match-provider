import "dotenv/config"
import { AddressInfo }                          from "net"
import { Server }                               from "http"
import cors                                     from "cors"
import express, { json, urlencoded }            from "express"
import type { NextFunction, Request, Response } from "express"
import { join }                                 from "path"
import config                                   from "./config"
import { InternalServerError, NotFound }        from "./HttpError"
import { startChecking }                        from "./JobManager"
import * as Gateway                             from "./Gateway"
import { router as FHIRRouter }                 from "./fhir" 
import { register }                             from "./register"
import { tokenHandler }                         from "./token"
import { OAuthError }                           from "./OAuthError"
import pkg                                      from "../package.json"
import {
    asyncRouteWrap,
    checkAuth,
    createOperationOutcome
} from "./lib"


const app = express()

app.use(cors({ origin: true, credentials: true }))

// Automatically parse incoming JSON payloads
app.use(json());

// throttle if needed
app.use((_rec, _res, next: NextFunction) => { setTimeout(next, config.throttle) });

// auth
app.post("/auth/register", urlencoded({ extended: false }), register)
app.post("/auth/token", urlencoded({ extended: false }), tokenHandler)

// bulk-match and other fhir endpoints
app.use(["/fhir", "/:match/fhir", "/:match/:duplicate/fhir"], FHIRRouter)

// get job status
app.get("/jobs/:id/status", checkAuth, asyncRouteWrap(Gateway.checkStatus))

// abort/delete job (bulk data like)
app.delete("/jobs/:id/status", checkAuth, asyncRouteWrap(Gateway.abort))

// download bulk file
app.get("/jobs/:id/files/:file", checkAuth, asyncRouteWrap(Gateway.downloadFile))

// proprietary: view job by ID
app.get("/jobs/:id", asyncRouteWrap(Gateway.getJob))

// proprietary: list all jobs
app.get("/jobs", asyncRouteWrap(Gateway.listJobs))

// People can download the patients.ndjson file
app.get("/patients", (req, res) => res.sendFile(join(__dirname, "../data/patients.ndjson")))

// The app will need to red some config vars
app.get("/config", (req, res) => {
    res.json({
        supportedAlgorithms        : config.supportedAlgorithms,
        jobMaxLifetimeMinutes      : config.jobMaxLifetimeMinutes,
        completedJobLifetimeMinutes: config.completedJobLifetimeMinutes,
        resourceParameterLimit     : config.resourceParameterLimit
    })
})

app.get("/env", (req, res) => { res.json({ VERSION: pkg.version }) })

// Static
app.use(express.static(join(__dirname, "../static/")));

// Static files for the web app
app.use(express.static(join(__dirname, "../dist/")));

// Global error 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json(new NotFound())
});

// Global error handler
app.use((error: any, req: Request, res: Response, next: NextFunction) => {

    // console.error(error)

    if (error instanceof OAuthError) {
        if (error.type === "invalid_client" && !res.headersSent && req.headers.authorization) {
            res.setHeader("WWW-Authenticate", "Bearer")
        }
        res.status(error.code).json({
            error: error.type,
            error_description: error.message
        });
        return
    }

    if (error && typeof error === "object" && error.resourceType === "OperationOutcome") {
        res.status(["fatal", "error"].includes(error.issue[0].severity) ? 500 : 400).json(error)
        return
    }

    if (!error.http) {
        error = new InternalServerError({ cause: error })
    }
    
    /* istanbul ignore next */
    if (process.env.NODE_ENV !== "test") console.dir(error, { depth: 10 });

    res.status(error.statusCode).json(createOperationOutcome(error.message, {
        issueCode: error.statusCode
    }))
})



async function main(): Promise<{
    address: string;
    server: Server;
    app: Express.Application;
}> {
    return new Promise(resolve => {
        const server = app.listen(+config.port, config.host, () => {
            let info = server.address() as AddressInfo
            
            /* istanbul ignore next */
            if (process.env.NODE_ENV !== "test") {
                startChecking() // periodically delete expired jobs
            }

            resolve({ server, app, address: `http://${info.address}:${info.port}` })
        });
    })
}

// istanbul ignore next
if (require.main === module) {
    main().then(({ address }) => {
        if (!process.env.CONTAINER) {
            console.log(`Server listening at ${address}`)
        }
    });
}

export default main;
