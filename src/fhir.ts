import { Router }                    from "express"
import { kickOff }                   from "./Gateway"
import patients                      from "./patients"
import { handleOperationDefinition } from "./OperationDefinition"
import handleCapabilityStatement     from "./CapabilityStatement"
import { smartConfig }               from "./WellKnown"
import {
    asyncRouteWrap,
    checkAuth,
    createOperationOutcome
} from "./lib"


export const router = Router({ mergeParams: true })

// .well-known/smart-configuration
router.get("/.well-known/smart-configuration", smartConfig)

// metadata
router.get("/metadata", handleCapabilityStatement)

// $bulk-match OperationDefinition
router.get("/OperationDefinition/bulk-match", handleOperationDefinition)

// $bulk-match Operation
router.post("/Patient/\\$bulk-match", checkAuth, asyncRouteWrap(kickOff))

// Get one patient by ID
router.get("/Patient/:id", (req, res) => {
    res.type("application/fhir+json; charset=utf-8")
    const patient = patients.find(p => p.id === req.params.id)
    if (!patient) {
        res.status(404).json(createOperationOutcome(
            `Cannot find patient with id "${req.params.id}"`
        ))
    } else {
        res.json(patient)
    }
})

export default router