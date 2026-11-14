declare module 'plotly.js-dist-min' {
  const Plotly: {
    newPlot: (
      root: HTMLElement | string,
      data: Array<Record<string, unknown>>,
      layout?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<unknown>;
    react: (
      root: HTMLElement | string,
      data: Array<Record<string, unknown>>,
      layout?: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<unknown>;
    purge: (root: HTMLElement | string) => void;
  };
  export default Plotly;
}
