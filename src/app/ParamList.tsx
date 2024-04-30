export default function ParamList({
    params,
    onChange,
    dataList
}: {
    dataList?: string
    params   : [string, string][]
    onChange : (p: typeof params) => void
}) {
    return (
        <div className="table-responsive-sm m-0">
            <table className="table align-middle table-sm table-borderless m-0">
                <tbody>{ params.map((pair, i) => (
                    <tr key={i}>
                        <td className="w-50 ps-0 small">
                            <input
                                className="form-control form-control-sm"
                                type="text"
                                placeholder="Header name"
                                list={ dataList }
                                value={ pair[0] }
                                onChange={ e => {
                                    params[i] = [e.target.value, pair[1]]
                                    onChange(params)
                                }}
                            />
                        </td>
                        <td className="w-50 pe-1 small">
                            <input
                                className="form-control form-control-sm"
                                type="text"
                                placeholder="Header value"
                                value={ pair[1] + "" }
                                onChange={e => {
                                    params[i] = [pair[0], e.target.value]
                                    onChange(params)
                                }}
                            />
                        </td>
                        <td className="p-0">
                            <button
                                className="btn btn-sm vi-remove-row"
                                type="button"
                                onClick={() => {
                                    params.splice(i, 1)
                                    onChange(params)
                                }}
                            >
                                <i className="bi bi-trash text-danger" />
                            </button>
                        </td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
    )
}
