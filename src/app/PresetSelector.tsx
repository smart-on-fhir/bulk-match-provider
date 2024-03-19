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
        <div className="btn-group">
            <div className="btn btn-primary form-control dropdown-toggle"
             data-bs-toggle="dropdown" data-bs-auto-close="true" aria-expanded="false">
                <b className="opacity-50">Preset:</b> { value ? value.name : "None" }
            </div>
            <div className="dropdown-menu dropdown-menu-end overflow-scroll" style={{ maxHeight: "calc(100vh - 4rem)" }}>
                <div className={ "dropdown-item" + (selectedIndex === -1 ? " active" : "") } onClick={ () => onChange(null) } style={{ cursor: "pointer" }}>
                    <div style={{ fontWeight: 600 }}>None</div>
                    <small className="opacity-50">Enter all options manually</small>
                </div>
                <div className="dropdown-divider"/>
                { PRESETS.map((s, i) => {
                    if (s === "-") {
                        return <div className="dropdown-divider" key={i} />
                    }
                    return (
                        <div key={i} className={ "dropdown-item" + (selectedIndex === i ? " active" : "") } onClick={ () => onChange(s) } style={{ cursor: "pointer" }}>
                            <div>{ s.name }</div>
                            { s.description && <small className="opacity-50">{ s.description }</small> }
                        </div>
                    )
                })}
            </div>
        </div>
    )
}