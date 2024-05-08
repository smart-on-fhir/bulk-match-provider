# bulk-match-provider
The Bulk Match Provider is an open-source reference implementation of the
FHIR [Bulk Match](https://build.fhir.org/ig/HL7/bulk-data/branches/bulk-match/match.html) IG.
Additionally, it offers a set of features designed to assist bulk match client developers.
For instance, this server supports authentication-free usage, can simulate matches, and can proxy
incoming match requests to external FHIR servers.


## Installation
The Bulk Match Provider is available online but can also be installed locally. It
requires NodeJS v20 or newer and a Unix-based OS such as macOS or Linux. We recommend
using NVM for managing NodeJS versions.

To get the code and install it, follow these steps:
```sh
# Go to destination folder
cd /my/projects

# Get the source code
git clone https://github.com/smart-on-fhir/bulk-match-provider.git

# Go into the project root
cd bulk-match-provider

# auto-select node version (or make sure you are using NodeJS 20+ if you don't have NVM)
nvm use

# Install dependencies
npm i

# Start the server
npm start
```

## Configuration
We use environment variables to configure the server. To create your own configuration,
create a file named `.env` in the project root and declare your configuration variables
there. Below is an example of all the supported variables along with their default values
and comments. These variables are optional and only need to be used if you want to
override their default values.

```sh
# Port number to run on. 0 means random port allocated by the OS
PORT=0

# Host or IP to listen on. "0.0.0.0" means the entire local network
HOST="0.0.0.0"

# Use this secret when signing our JWT tokens. Must be changed before running
# another instance.
SECRET="this is our patient matching secret"

# Max allowed access token lifetime in minutes
MAX_ACCESS_TOKEN_LIFETIME=60

# Keep jobs for how long (minutes since creation)
JOB_MAX_LIFETIME_MINUTES=60

# Check for old jobs once every ? minutes
JOB_CLEANUP_MINUTES=5

# MS to wait before matching each input patient. This is useful for slowing
# down matches to make them look more realistic, as well as to have a
# predictable durations while testing
JOB_THROTTLE=1000

# Throttle all http responses (mostly useful for development/testing)
THROTTLE=0

# If we reach this number more jobs cannot be started and clients will be
#  required to retry later after some jobs have (hopefully) completed
MAX_RUNNING_JOBS=100
```
After creating or updating the `.env` file, the server must be restarted to
apply those changes.


## Local Development
To run the server and the sample app locally, navigate to the project root folder and run:

```
nmp run dev
```
This command will:
- Delete previous builds of the sample app (if any)
- Start a hot reloading server for the app at http://localhost:3457/
- Start a reloading server for the backend at http://localhost:3456/.
  This one will also serve the app, but any changes in the app's source code will
  not be applied without refreshing the page. Note that your `PORT` environment
  variable will be ignored when running the `dev` script.

## Matching

Patients can be matched either by identifier (SSN and MRN implemented), resulting
in a "hard" match with 100% confidence, or by fuzzy matching a combination of
parameters. The minimum required set of parameters to match includes `name` and
`birthDate`, providing a confidence of `0.6` (60%). Additional matched parameters
further increase the confidence score.

### Comparing Names

1. We compare flattened versions of [human names](https://hl7.org/fhir/R4/datatypes.html#HumanName)
   consisting of `given` and `family` name values concatenated with a space character.
2. Our comparison is case-insensitive.
3. We ignore the `use`, `text`, `prefix`, `suffix`, and `period` properties if present.
4. Both the input resource and the source Patient being compared can have multiple names.
   The match is successful only if there is one (or more) overlapping name between
   the two name arrays.

Note that having a matching name is not sufficient to match a patient; it needs to be
combined with other matched properties.

### Comparing DOB

We compare birth dates with a **day precision**, meaning that we consider two birth
dates equal if they represent the same year, month, and day, ignoring the time part
(if any). Note that in FHIR, the [birthDate](https://hl7.org/fhir/R4/patient-definitions.html#Patient.birthDate)
can also be loosely specified as `YYYY` or `YYYY-MM`. This means that, for example,
we would match all of the following dates as equal: `2020`, `2020-01`,
`2020-01-01`, `2020-01-01T10:12:34`.
