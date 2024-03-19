# bulk-match-provider
Bulk Match Provider


## Matching

Patients can either be matched by identifier (SSN and MRN implemented), in which
case we have a "hard" match with 100% confidence, of by fuzzy matching combination
of parameter. The minimal required set of parameters to match includes `name` and
`birthDate` and provides a confidence of `0.6` (60%). Any additionally matched
parameter will further increase the confidence score.


### Comparing Names
1. We compare flattened versions of [human names](https://hl7.org/fhir/R4/datatypes.html#HumanName) 
   consisting of `given` and `family` name values concatenated with a space character.
2. Our comparison is case-insensitive
3. We ignore the `use`, `text`, `prefix`, `suffix`, and `period` properties if present.
4. The input resource and the source Patient that we compare with can both have multiple
   names. The match is successful only if the re is one (or more) overlapping name 
   between the two name arrays.

Note that having a matching name is not sufficient match a patient and needs to 
be combined with other matched properties. 


### Comparing DOB

We compare birth dates with a **day precision**, meaning that we consider two birth
dates equal if they represent the same year month and day, ignoring the time part (if any).
Note that in FHIR the [birthDate](https://hl7.org/fhir/R4/patient-definitions.html#Patient.birthDate) 
can also be loosely specified as `YYYY` or `YYYY-MM`. This means that, for example,
we would match all of the following dates as equal: `2020`, `2020-01`, `2020-01-01`, `2020-01-01T10:12:34`

## Running the app
Running locally for development:
```
nmp run dev
``
This will:
- Delete previous builds of the app (if any)
- Start a hot reloading server for the app at http://localhost:3457/
- Start a reloading server for the backend at http://localhost:3456/. Note that
  this one will aso serve the app but any changes in the app's source code will
  not be applied without refreshing the page.


In development just make sure you have the `NODE_ENV` environment variable set
to production and then call:
```
nmp run dev
``