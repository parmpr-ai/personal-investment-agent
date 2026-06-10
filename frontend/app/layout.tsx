import './globals.css'
import ErrorBoundary from '../components/ErrorBoundary'
export const metadata={title:'Workspace',description:'Private workspace'}
export default function RootLayout({children}:{children:React.ReactNode}){
	return (
		<html lang="en">
			<body>
				<ErrorBoundary>
					{children}
				</ErrorBoundary>
			</body>
		</html>
	)
}
