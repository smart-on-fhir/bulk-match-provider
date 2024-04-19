import PRESETS, { Preset } from "./presets"

export default function PresetSelector({
    value = null,
    onChange
} : {
    value?: Preset | null
    onChange: (snippet: Preset | null) => void
}) {
    const selectedIndex = value ? PRESETS.findIndex(x => JSON.stringify(x) === JSON.stringify(value)) : -1
    return (
        <div className="btn-group w-100 preset-selector">
            <div className="btn btn-primary form-control dropdown-toggle text-start text-lg-end text-wrap"
             data-bs-toggle="dropdown" data-bs-auto-close="true" aria-expanded="false">
                <b className="opacity-50">Preset:</b> { value ? value.name : "None" }
            </div>
            <div className="dropdown-menu overflow-scroll w-100 shadow-sm" style={{ maxHeight: "calc(100vh - 4rem)" }}>
                <div className={ "dropdown-item small" + (selectedIndex === -1 ? " active" : "") } onClick={ () => onChange(null) } style={{ cursor: "pointer" }}>
                    <div style={{ fontWeight: 600 }}>None</div>
                    <small className="opacity-50">Enter all options manually</small>
                </div>
                <div className="dropdown-divider"/>
                { PRESETS.map((s, i) => {
                    if (s === "-") {
                        return <div className="dropdown-divider" key={i} />
                    }
                    return (
                        <div key={i} className={ "dropdown-item small" + (selectedIndex === i ? " active" : "") } onClick={ () => onChange(s) } style={{ cursor: "pointer" }}>
                            <div>{ s.name }</div>
                            { s.description && <small className="opacity-50">{ s.description }</small> }
                        </div>
                    )
                })}
            </div>
        </div>
    )
}