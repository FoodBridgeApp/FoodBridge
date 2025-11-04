import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(p){ super(p); this.state = { hasError:false, msg:"" }; }
  static getDerivedStateFromError(err){ return { hasError:true, msg: String(err?.message||err)||"Error" }; }
  componentDidCatch(err, info){ console.error("ErrorBoundary", err, info); }
  render(){
    if (this.state.hasError) {
      return <div className="toast error">Something went wrong: {this.state.msg}</div>;
    }
    return this.props.children;
  }
}
