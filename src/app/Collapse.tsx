import { ReactNode, useEffect, useState } from "react"


export default function Collapse({ children, header, open }: { children?: ReactNode, header: ReactNode, open?: boolean }) {
    const [isOpen, setIsOpen] = useState(!!open)

    // @ts-ignore
    useEffect(() => window.Prism.highlightAll());

    return (
        <div>
            <div className="d-flex align-items-baseline mb-1" style={{ cursor: "pointer", wordBreak: "break-all" }} onClick={() => setIsOpen(!isOpen)}>
                <i className={ isOpen ? "bi bi-caret-down-fill me-1" : "bi bi-caret-right-fill me-1" } />
                { header }
            </div>
            <div style={{ marginLeft: "1.3em" }}>
                { isOpen && children }
            </div>
        </div>
    )
}
