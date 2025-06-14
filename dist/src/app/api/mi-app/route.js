import { NextResponse } from "next/server";
import { avalancheFuji } from "viem/chains";
import { createMetadata, } from "@sherrylinks/sdk";
import { serialize } from "wagmi";
import { abi } from "@/blockchain/abi";
import { encodeFunctionData, http, createPublicClient } from "viem";
import { checkHashtagsAndMentions } from "@/services/twitterService";
const CONTRACT_ADDRESS = "0xd293e159a133A75098a3D814E681d73B88a7167b";
const publicClient = createPublicClient({
    chain: avalancheFuji,
    transport: http('https://api.avax-test.network/ext/bc/C/rpc'), // RPC pública de Fuji
});
export async function GET(req) {
    //todo: averiguar si se puede obtener la address del usuario desde el frontend de sherry
    try {
        const host = req.headers.get("host") || "localhost:3000";
        const protocol = req.headers.get("x-forwarded-proto") || "http";
        const serverUrl = `${protocol}://${host}`;
        const metadata = {
            "url": "https://sherry.social",
            "icon": "https://avatars.githubusercontent.com/u/117962315",
            "title": "Social Mint",
            "baseUrl": "http://ec2-3-145-1-198.us-east-2.compute.amazonaws.com",
            "description": "Valida si tu post de X cumple con todos las condiciones necesarias para habilitarte el minteo de tu POAP!",
            "actions": [
                {
                    "type": "dynamic",
                    "label": "Valida tu post de X",
                    "description": "Validar",
                    "chains": {
                        "source": "fuji"
                    },
                    "path": "/api/mi-app",
                    "params": [
                        {
                            "name": "eventCode",
                            "label": "Codigo del evento.",
                            "type": "text",
                            "required": true,
                            "description": "Ingresa el codigo del evento"
                        },
                        {
                            "name": "userHandler",
                            "label": "Twitter Handler",
                            "type": "text",
                            "required": true,
                            "description": "Ingresa tu usuario de Twitter (X)"
                        }
                    ]
                }
            ]
        };
        // Validar metadata usando el SDK
        const validated = createMetadata(metadata);
        // Retornar con headers CORS para acceso cross-origin
        return NextResponse.json(validated, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            },
        });
    }
    catch (error) {
        console.error("Error creando metadata:", error);
        return NextResponse.json({ error: "Error al crear metadata" }, { status: 500 });
    }
}
export async function POST(req) {
    try {
        const { eventCode, userHandler } = await req.json();
        if (!eventCode || !userHandler) {
            return NextResponse.json({ error: "'eventCode' and 'userHandler' son requeridos" }, { status: 400 });
        }
        const eventData = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: abi,
            functionName: "getEvent",
            args: [eventCode.toLowerCase()],
        });
        const { tags } = parseEventData([eventData]);
        const isEventValid = await checkHashtagsAndMentions("rflores012", tags);
        if (!isEventValid) {
            return NextResponse.json({ error: "No se encontró publicación con los tags del evento" }, { status: 400 });
        }
        const data = encodeFunctionData({
            abi,
            functionName: "addParticipant",
            args: [eventCode],
        });
        const tx = {
            to: CONTRACT_ADDRESS,
            data: data,
            chainId: avalancheFuji.id,
            type: 'legacy',
        };
        // Serializar transacción
        const serialized = serialize(tx);
        // Crear respuesta
        const resp = {
            serializedTransaction: serialized,
            chainId: avalancheFuji.name,
        };
        return NextResponse.json(resp, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    }
    catch (error) {
        console.error("Error en petición POST:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version',
        },
    });
}
// Función para parsear los datos del smart contract
function parseEventData(rawData) {
    return {
        name: rawData[0],
        tags: rawData[1],
        address: rawData[2],
        additionalData: rawData[3],
        timestamp: rawData[4],
        amount: rawData[5],
        isActive: rawData[6]
    };
}
