import { CSSProperties } from 'react';

interface CardBackProps {
    width?: number;
    height?: number;
    className?: string;
    style?: CSSProperties;
}

export default function CardBack({ 
    width = 60, 
    height = 90, 
    className = "", 
    style = {} 
}: CardBackProps) {
    return (
        <div 
            className={`select-none pointer-events-none ${className}`} 
            style={{
                width: `${width}px`,
                height: `${height}px`,
                ...style
            }}
        >
            <div className="w-full h-full bg-gradient-to-br from-red-600 to-red-700 rounded-lg shadow-sm flex items-center justify-center border-2 border-white/20">
                <div className="bg-white rounded-lg transform -rotate-12 px-3 py-1">
                    <span className="text-red-600 font-bold" style={{ fontSize: `${width/4}px` }}>
                        UNO
                    </span>
                </div>
                <div className="absolute inset-0 bg-white/5 rounded-lg"></div>
            </div>
        </div>
    );
} 