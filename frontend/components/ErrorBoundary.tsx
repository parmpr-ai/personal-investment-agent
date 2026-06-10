"use client"
import React from 'react'

type State = {hasError:boolean,error?:Error}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, State> {
  constructor(props:any){
    super(props)
    this.state={hasError:false}
  }
  static getDerivedStateFromError(error:Error){
    return {hasError:true, error}
  }
  componentDidCatch(error:Error, info:any){
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info)
  }
  render(){
    if(this.state.hasError){
      return (
        <div style={{padding:20,fontFamily:'Inter, system-ui, -apple-system, Segoe UI, Roboto',color:'#fff',background:'#0b1220',minHeight:'100vh'}}>
          <h2>Something went wrong</h2>
          <p>The application encountered an error. Try reloading the page.</p>
          <pre style={{whiteSpace:'pre-wrap',color:'#f88'}}>{String(this.state.error)}</pre>
        </div>
      )
    }
    return this.props.children as React.ReactElement
  }
}
